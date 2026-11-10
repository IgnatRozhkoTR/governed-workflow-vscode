import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError, AuthRequiredError } from '../api/errors';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import type { WorkspaceRef, WorkspaceState } from '../api/types';
import {
  attentionSignals,
  isReflectionPhase,
  isSameNav,
  needsAttentionNav,
  type NavTarget,
  type Topic,
} from '../shared/navigation';
import { wsPath } from '../shared/paths';
import {
  PROTOCOL_VERSION,
  isLocale,
  type ApiRequest,
  type ApiResponse,
  type ConnectionStatus,
  type Locale,
  type PanelBootstrap,
  type WorkspaceSnapshot,
} from '../shared/protocol';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import { handleApiRequest } from './apiBridge';
import { LastTabMemory, isTabId } from './lastTabMemory';
import { createNativeHandlers } from './nativeActions';
import { createNonce } from './nonce';
import { WEBVIEW_DIST_SEGMENTS, buildPanelHtml } from './panelHtml';
import { ControlPanelSerializer, type ControlPanelRestorer } from './panelSerializer';
import { ReadyGatedNavigation } from './readyGatedNavigation';
import { RpcHandlerError, RpcHost, type RpcHandlers } from './rpcHost';

export const CONTROL_PANEL_VIEW_TYPE = 'governedWorkflow.control';
const PANEL_OPEN_CONTEXT_KEY = 'governedWorkflow.panelOpen';
const SET_TOKEN_COMMAND = 'governedWorkflow.setToken';
const DEFAULT_TITLE = 'Workspace Control';
const DEFAULT_LOCALE: Locale = 'en';
const CONNECTION_OK: ConnectionStatus = { status: 'ok' };
const PROPOSED_STATUS = 'proposed';

// A first visit lands once the workspace state is known, unless the user picks a tab or a target is requested first.
type LandingStage = 'awaiting_state' | 'open' | 'closed';

export interface ControlPanelDeps {
  readonly client: ApiClient;
  readonly active: ActiveWorkspace;
  readonly locator: WorkspaceLocator;
}

export interface WorkspaceControlPanelHost {
  createOrShow(nav?: NavTarget): void;
  invalidate(topics: readonly Topic[]): void;
}

class WorkspaceControlPanel implements vscode.Disposable {
  private readonly rpc: RpcHost;
  private readonly navigation: ReadyGatedNavigation;
  private readonly subscriptions: vscode.Disposable[] = [];
  private pollerSubscriptions: vscode.Disposable[] = [];
  private connection: ConnectionStatus = CONNECTION_OK;
  private hasPromptedForToken = false;
  private shownRef: WorkspaceRef | undefined;
  private landing: LandingStage;
  private landingGeneration = 0;
  private landedNav: NavTarget;

  constructor(
    readonly panel: vscode.WebviewPanel,
    private readonly deps: ControlPanelDeps,
    private readonly lastTabs: LastTabMemory,
    extensionUri: vscode.Uri,
    requestedNav: NavTarget | undefined,
  ) {
    this.shownRef = deps.active.ref;
    this.landing = requestedNav === undefined ? this.openLandingStage() : 'closed';
    const nav = requestedNav ?? this.initialNav();
    this.landedNav = nav;
    panel.webview.options = webviewOptions(extensionUri);
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg');
    this.rpc = new RpcHost(panel.webview, this.createHandlers(), (protocol) => this.handleReady(protocol));
    this.navigation = new ReadyGatedNavigation((target) => this.rpc.postEvent({ kind: 'event', event: 'navigate', payload: target }));
    panel.webview.html = buildPanelHtml(panel.webview, extensionUri, createNonce(), this.bootstrap(nav));
    this.subscriptions.push(
      panel.webview.onDidReceiveMessage((message: unknown) => void this.rpc.handleMessage(message)),
      panel.onDidChangeViewState((event) => this.handleViewStateChange(event.webviewPanel.visible)),
      deps.active.onDidChange(() => this.handleWorkspaceChange()),
      deps.active.onDidChangeState(() => this.handleStateChange()),
    );
    this.followPoller();
    this.updateTitle();
    deps.active.setPanelVisible(panel.visible);
    this.refineLandingWhenOpen();
  }

  reveal(nav: NavTarget | undefined): void {
    this.panel.reveal();
    if (nav !== undefined) {
      this.closeLanding();
      this.navigation.request(nav);
    }
  }

  invalidate(topics: readonly Topic[]): void {
    this.rpc.postEvent({ kind: 'event', event: 'invalidate', payload: { topics } });
  }

  dispose(): void {
    this.releasePoller();
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }

  private createHandlers(): RpcHandlers {
    return {
      'api.request': (request) => this.forwardApiRequest(request),
      'i18n.load': ({ locale }) => this.loadMessages(locale),
      'workspace.snapshot': async () => this.snapshot(),
      'state.refresh': () => this.refreshState(),
      'panel.rememberTab': ({ tab }) => this.rememberTab(tab),
      ...createNativeHandlers(this.deps),
    };
  }

  private async forwardApiRequest(request: ApiRequest): Promise<ApiResponse> {
    try {
      return await handleApiRequest(this.deps.client, request);
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        this.handleAuthRequired();
      }
      throw error;
    }
  }

  private async loadMessages(locale: unknown): Promise<Record<string, string>> {
    if (!isLocale(locale)) {
      throw new RpcHandlerError('forbidden_path', `Locale "${String(locale)}" is not available.`);
    }
    return this.deps.client.fetchI18n(locale);
  }

  private async refreshState(): Promise<void> {
    const poller = this.deps.active.poller;
    if (poller === undefined) {
      throw new RpcHandlerError('no_workspace', 'No workspace is selected.');
    }
    await poller.refreshNow();
  }

  private async rememberTab(tab: unknown): Promise<void> {
    const ref = this.deps.active.ref;
    if (ref === undefined) {
      throw new RpcHandlerError('no_workspace', 'No workspace is selected.');
    }
    if (!isTabId(tab)) {
      throw new RpcHandlerError('invalid_tab', `Tab "${String(tab)}" does not exist.`);
    }
    this.closeLanding();
    this.navigation.recordShown({ tab });
    await this.lastTabs.remember(ref, tab);
  }

  private handleAuthRequired(): void {
    this.setConnection({ status: 'auth_required' });
    if (!this.hasPromptedForToken) {
      this.hasPromptedForToken = true;
      void vscode.commands.executeCommand(SET_TOKEN_COMMAND);
    }
  }

  private handleReady(protocol: number): void {
    if (protocol !== PROTOCOL_VERSION) {
      this.setConnection({ status: 'error', message: 'The panel and the extension versions differ. Reload the window.' });
      return;
    }
    this.rpc.postEvent({ kind: 'event', event: 'workspace', payload: this.snapshot() });
    if (this.connection.status !== 'ok') {
      this.rpc.postEvent({ kind: 'event', event: 'connection', payload: this.connection });
    }
    this.navigation.markReady();
  }

  private handleViewStateChange(isVisible: boolean): void {
    this.deps.active.setPanelVisible(isVisible);
    if (isVisible) {
      this.rpc.postEvent({ kind: 'event', event: 'workspace', payload: this.snapshot() });
    }
  }

  private handleWorkspaceChange(): void {
    this.followPoller();
    this.updateTitle();
    this.rpc.postEvent({ kind: 'event', event: 'workspace', payload: this.snapshot() });
    this.showRememberedTabOnSwitch(this.deps.active.ref);
  }

  private showRememberedTabOnSwitch(ref: WorkspaceRef | undefined): void {
    const isSwitch = ref !== undefined && (ref.projectId !== this.shownRef?.projectId || ref.branch !== this.shownRef.branch);
    this.shownRef = ref;
    if (isSwitch) {
      this.closeLanding();
      this.landing = this.openLandingStage();
      this.landedNav = this.initialNav();
      this.navigation.request(this.landedNav);
      this.refineLandingWhenOpen();
    }
  }

  private handleStateChange(): void {
    this.rpc.postEvent({ kind: 'event', event: 'state', payload: this.snapshot() });
    if (this.landing === 'awaiting_state') {
      this.landing = 'open';
      this.refineLandingWhenOpen();
    }
    if (this.connection.status !== 'ok') {
      this.setConnection(CONNECTION_OK);
    }
  }

  private openLandingStage(): LandingStage {
    return this.deps.active.state === undefined ? 'awaiting_state' : 'open';
  }

  private closeLanding(): void {
    this.landing = 'closed';
    this.landingGeneration++;
  }

  private refineLandingWhenOpen(): void {
    if (this.landing === 'open') {
      void this.refineLanding();
    }
  }

  // What needs the user is only fully known once the state (and, in reflection, the proposals) is loaded,
  // so the landing tab shown at bootstrap is re-targeted then, unless the user has moved on meanwhile.
  private async refineLanding(): Promise<void> {
    const generation = ++this.landingGeneration;
    const { ref, state } = this.deps.active;
    if (ref === undefined || state === undefined) {
      return;
    }
    const target = this.lastTabs.initialNav(ref, await this.attentionNav(ref, state));
    if (generation !== this.landingGeneration || this.landing !== 'open') {
      return;
    }
    this.landing = 'closed';
    if (!isSameNav(target, this.landedNav)) {
      this.landedNav = target;
      this.navigation.request(target);
    }
  }

  private async attentionNav(ref: WorkspaceRef, state: WorkspaceState): Promise<NavTarget | undefined> {
    const pendingProposals = isReflectionPhase(state.phase) ? await this.countPendingProposals(ref) : 0;
    return needsAttentionNav(attentionSignals(state, pendingProposals));
  }

  // Landing is a convenience: if the proposals cannot be read, the panel lands as if none waited,
  // and the Reflection tab reports the failure when the user opens it.
  private async countPendingProposals(ref: WorkspaceRef): Promise<number> {
    try {
      const response = await this.deps.client.request({ method: 'GET', path: wsPath(ref, 'proposals'), query: { status: PROPOSED_STATUS } });
      return countProposed(response.body);
    } catch (error) {
      if (error instanceof ApiError) {
        return 0;
      }
      throw error;
    }
  }

  private initialNav(): NavTarget {
    const state = this.deps.active.state;
    const attention = state === undefined ? undefined : needsAttentionNav(attentionSignals(state, 0));
    return this.lastTabs.initialNav(this.deps.active.ref, attention);
  }

  private followPoller(): void {
    this.releasePoller();
    const poller = this.deps.active.poller;
    if (poller === undefined) {
      return;
    }
    this.pollerSubscriptions = [
      poller.onAuthRequired(() => this.setConnection({ status: 'auth_required' })),
      poller.onDidFail((error) => this.setConnection({ status: 'error', message: error.message })),
    ];
  }

  private releasePoller(): void {
    this.pollerSubscriptions.forEach((subscription) => subscription.dispose());
    this.pollerSubscriptions = [];
  }

  private setConnection(status: ConnectionStatus): void {
    this.connection = status;
    this.rpc.postEvent({ kind: 'event', event: 'connection', payload: status });
  }

  private updateTitle(): void {
    const ref = this.deps.active.ref;
    this.panel.title = ref === undefined ? DEFAULT_TITLE : `GW: ${ref.branch}`;
  }

  private snapshot(): WorkspaceSnapshot {
    const { active } = this.deps;
    return { workspace: active.ref ?? null, state: active.state ?? null, etag: active.poller?.currentEtag ?? null };
  }

  private bootstrap(nav: NavTarget): PanelBootstrap {
    const locale = this.deps.active.state?.locale;
    return { protocol: PROTOCOL_VERSION, snapshot: this.snapshot(), nav, locale: isLocale(locale) ? locale : DEFAULT_LOCALE };
  }
}

class ControlPanelManager implements WorkspaceControlPanelHost, ControlPanelRestorer, vscode.Disposable {
  private current: WorkspaceControlPanel | undefined;

  constructor(
    private readonly deps: ControlPanelDeps,
    private readonly lastTabs: LastTabMemory,
    private readonly extensionUri: vscode.Uri,
  ) {}

  createOrShow(nav?: NavTarget): void {
    if (this.current !== undefined) {
      this.current.reveal(nav);
      return;
    }
    const panel = vscode.window.createWebviewPanel(CONTROL_PANEL_VIEW_TYPE, DEFAULT_TITLE, vscode.ViewColumn.Active, {
      ...webviewOptions(this.extensionUri),
      retainContextWhenHidden: true,
      enableFindWidget: true,
    });
    this.attach(panel, nav);
  }

  restore(panel: vscode.WebviewPanel, nav: NavTarget | undefined): void {
    this.current?.panel.dispose();
    this.attach(panel, nav);
  }

  invalidate(topics: readonly Topic[]): void {
    this.current?.invalidate(topics);
  }

  dispose(): void {
    this.current?.panel.dispose();
  }

  private attach(panel: vscode.WebviewPanel, nav: NavTarget | undefined): void {
    const controlPanel = new WorkspaceControlPanel(panel, this.deps, this.lastTabs, this.extensionUri, nav);
    this.current = controlPanel;
    void vscode.commands.executeCommand('setContext', PANEL_OPEN_CONTEXT_KEY, true);
    panel.onDidDispose(() => this.detach(controlPanel));
  }

  private detach(controlPanel: WorkspaceControlPanel): void {
    controlPanel.dispose();
    if (this.current === controlPanel) {
      this.current = undefined;
      this.deps.active.setPanelVisible(false);
      void vscode.commands.executeCommand('setContext', PANEL_OPEN_CONTEXT_KEY, false);
    }
  }
}

export function registerControlPanel(context: vscode.ExtensionContext, deps: ControlPanelDeps): WorkspaceControlPanelHost {
  const manager = new ControlPanelManager(deps, new LastTabMemory(context.globalState), context.extensionUri);
  context.subscriptions.push(
    manager,
    vscode.window.registerWebviewPanelSerializer(CONTROL_PANEL_VIEW_TYPE, new ControlPanelSerializer(manager)),
  );
  return manager;
}

function countProposed(body: unknown): number {
  const proposals = (body as { proposals?: unknown } | undefined)?.proposals;
  if (!Array.isArray(proposals)) {
    return 0;
  }
  return proposals.filter((proposal: unknown) => (proposal as { status?: unknown } | null)?.status === PROPOSED_STATUS).length;
}

function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, ...WEBVIEW_DIST_SEGMENTS)],
  };
}
