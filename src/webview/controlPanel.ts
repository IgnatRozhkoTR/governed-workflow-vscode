import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { AuthRequiredError } from '../api/errors';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import { DEFAULT_NAV, type NavTarget, type Topic } from '../shared/navigation';
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
import { createNativeHandlers } from './nativeActions';
import { createNonce } from './nonce';
import { WEBVIEW_DIST_SEGMENTS, buildPanelHtml } from './panelHtml';
import { ControlPanelSerializer, type ControlPanelRestorer } from './panelSerializer';
import { RpcHandlerError, RpcHost, type RpcHandlers } from './rpcHost';

export const CONTROL_PANEL_VIEW_TYPE = 'governedWorkflow.control';
const PANEL_OPEN_CONTEXT_KEY = 'governedWorkflow.panelOpen';
const SET_TOKEN_COMMAND = 'governedWorkflow.setToken';
const DEFAULT_TITLE = 'Workspace Control';
const DEFAULT_LOCALE: Locale = 'en';
const CONNECTION_OK: ConnectionStatus = { status: 'ok' };

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
  private readonly subscriptions: vscode.Disposable[] = [];
  private pollerSubscriptions: vscode.Disposable[] = [];
  private connection: ConnectionStatus = CONNECTION_OK;
  private hasPromptedForToken = false;

  constructor(
    readonly panel: vscode.WebviewPanel,
    private readonly deps: ControlPanelDeps,
    extensionUri: vscode.Uri,
    nav: NavTarget,
  ) {
    panel.webview.options = webviewOptions(extensionUri);
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg');
    this.rpc = new RpcHost(panel.webview, this.createHandlers(), (protocol) => this.handleReady(protocol));
    panel.webview.html = buildPanelHtml(panel.webview, extensionUri, createNonce(), this.bootstrap(nav));
    this.subscriptions.push(
      panel.webview.onDidReceiveMessage((message: unknown) => void this.rpc.handleMessage(message)),
      deps.active.onDidChange(() => this.handleWorkspaceChange()),
      deps.active.onDidChangeState(() => this.handleStateChange()),
    );
    this.followPoller();
    this.updateTitle();
  }

  reveal(nav: NavTarget | undefined): void {
    this.panel.reveal();
    if (nav !== undefined) {
      this.rpc.postEvent({ kind: 'event', event: 'navigate', payload: nav });
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
  }

  private handleWorkspaceChange(): void {
    this.followPoller();
    this.updateTitle();
    this.rpc.postEvent({ kind: 'event', event: 'workspace', payload: this.snapshot() });
  }

  private handleStateChange(): void {
    this.rpc.postEvent({ kind: 'event', event: 'state', payload: this.snapshot() });
    if (this.connection.status !== 'ok') {
      this.setConnection(CONNECTION_OK);
    }
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
    this.attach(panel, nav ?? DEFAULT_NAV);
  }

  restore(panel: vscode.WebviewPanel, nav: NavTarget): void {
    this.current?.panel.dispose();
    this.attach(panel, nav);
  }

  invalidate(topics: readonly Topic[]): void {
    this.current?.invalidate(topics);
  }

  dispose(): void {
    this.current?.panel.dispose();
  }

  private attach(panel: vscode.WebviewPanel, nav: NavTarget): void {
    const controlPanel = new WorkspaceControlPanel(panel, this.deps, this.extensionUri, nav);
    this.current = controlPanel;
    void vscode.commands.executeCommand('setContext', PANEL_OPEN_CONTEXT_KEY, true);
    panel.onDidDispose(() => this.detach(controlPanel));
  }

  private detach(controlPanel: WorkspaceControlPanel): void {
    controlPanel.dispose();
    if (this.current === controlPanel) {
      this.current = undefined;
      void vscode.commands.executeCommand('setContext', PANEL_OPEN_CONTEXT_KEY, false);
    }
  }
}

export function registerControlPanel(context: vscode.ExtensionContext, deps: ControlPanelDeps): WorkspaceControlPanelHost {
  const manager = new ControlPanelManager(deps, context.extensionUri);
  context.subscriptions.push(
    manager,
    vscode.window.registerWebviewPanelSerializer(CONTROL_PANEL_VIEW_TYPE, new ControlPanelSerializer(manager)),
  );
  return manager;
}

function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, ...WEBVIEW_DIST_SEGMENTS)],
  };
}
