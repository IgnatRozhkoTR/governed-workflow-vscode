import * as vscode from 'vscode';
import { ApiClient } from './api/client';
import type { WorkspaceState } from './api/types';
import { registerAnnotations } from './annotations/annotationProvider';
import { COMMAND_IDS, registerWorkspaceCommands } from './commands/workspaceCommands';
import { registerGateCommands } from './commands/gateCommands';
import { registerProjectCommands } from './commands/projectCommands';
import { registerResourceComments } from './comments/resourceComments';
import { registerResolveCommands } from './comments/resolveCommands';
import { registerReviewComments } from './comments/reviewComments';
import { Settings } from './config/settings';
import { TokenStore } from './config/tokenStore';
import { registerChangesTree } from './diff/changesTree';
import { BaseContentProvider } from './fs/baseContentProvider';
import { REMOTE_FS_READONLY, RemoteFileSystem } from './fs/remoteFileSystem';
import { BASE_FILE_SCHEME, REMOTE_FILE_SCHEME } from './fs/uris';
import { WorkspaceLocator } from './fs/workspaceLocator';
import { ActiveWorkspace } from './state/activeWorkspace';
import { registerClaudeTerminal } from './terminal/claudeTerminal';
import { registerImageAttach } from './terminal/imageAttach';
import { TerminalPlacement } from './terminal/terminalLayout';
import { registerTerminalLayout } from './terminal/terminalLayoutCommands';
import { registerTerminalSessionCommands } from './terminal/terminalSessions';
import { registerCommentsView } from './views/commentsTree';
import { registerLauncherTree } from './views/launcherTree';
import { registerProjectsTree } from './views/projectsTree';
import { registerWorkspaceIndicators } from './views/workspaceIndicators';
import { registerControlPanel, type WorkspaceControlPanelHost } from './webview/controlPanel';
import { registerPanelCommands } from './webview/panelCommands';
import { registerCompanions } from './companions/companionCommands';
import { CompanionPromptMemory } from './companions/companionPromptMemory';
import { registerSshHostCheck } from './worktree/sshHostExtension';
import { SshWorktreeOpener } from './worktree/sshWorktreeOpener';
import { registerWindowAssociation } from './worktree/windowAssociation';
import { WindowSelectionMemory } from './worktree/windowSelectionMemory';
import { WorkspaceSelector } from './worktree/workspaceSelector';
import { WorktreeHandoff } from './worktree/worktreeHandoff';

const SET_TOKEN_ACTION = 'Set token';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const settings = new Settings();
  const tokens = new TokenStore(context.secrets);
  const client = new ApiClient(
    () => settings.serverUrl,
    () => tokens.get(),
  );
  const active = new ActiveWorkspace(client, settings);
  const locator = new WorkspaceLocator();
  const view = activeView(context, active);
  context.subscriptions.push(settings, active);

  registerVirtualFileSystems(context, client);
  const panel = registerControlPanel(context, { client, active, locator });
  registerPanelCommands(context, { client, active, panel });
  const projectsTree = registerProjectsTree(context, { client });
  registerLauncherTree(context, { active });
  registerWorkspaceIndicators(context, active);
  const handoff = new WorktreeHandoff(context.globalState);
  const companionMemory = new CompanionPromptMemory(context.globalState);
  const sshOpener = new SshWorktreeOpener({ client, settings, handoff, companionMemory, extensionId: context.extension.id });
  const selector = new WorkspaceSelector({ client, active, locator, settings, handoff, sshOpener });
  registerWorkspaceCommands(context, { client, active, tokens, locator, projectsTree, selector });
  registerProjectCommands(context, { client, projectsTree, activeWorkspace: view });
  registerChangesTree(context, { client, locator, active });
  registerComments(context, { client, locator, active, panel });
  const placement = new TerminalPlacement();
  const claude = registerClaudeTerminal(context, { client, activeWorkspace: view, placement });
  registerTerminalLayout(context, { placement, terminals: claude, activeWorkspace: view });
  registerTerminalSessionCommands(context, { client });
  registerImageAttach(context, { client, activeWorkspace: view, claude });
  registerGateCommands(context, { client, active: view });
  registerAnnotations(context);
  registerCompanions(context, { settings, memory: companionMemory });
  registerSshHostCheck(context);
  registerWindowAssociation(context, { client, active, selector, handoff, memory: new WindowSelectionMemory(context.workspaceState) });

  void promptForMissingToken(tokens);
}

export function deactivate(): void {}

function registerVirtualFileSystems(context: vscode.ExtensionContext, client: ApiClient): void {
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(REMOTE_FILE_SCHEME, new RemoteFileSystem(client), {
      isReadonly: REMOTE_FS_READONLY,
      isCaseSensitive: true,
    }),
    vscode.workspace.registerTextDocumentContentProvider(BASE_FILE_SCHEME, new BaseContentProvider(client)),
  );
}

interface CommentWiringDeps {
  readonly client: ApiClient;
  readonly locator: WorkspaceLocator;
  readonly active: ActiveWorkspace;
  readonly panel: WorkspaceControlPanelHost;
}

// Native comment changes reach the panel through this invalidate; panel-side changes reach the native threads
// through the state refresh the panel requests after every mutation.
function registerComments(context: vscode.ExtensionContext, deps: CommentWiringDeps): void {
  const { comments, controller } = registerReviewComments(context, deps);
  registerResourceComments(context, { comments, locator: deps.locator });
  registerResolveCommands(context, { comments, controller, locator: deps.locator });
  registerCommentsView(context, { comments, controller, locator: deps.locator, panel: deps.panel });
  context.subscriptions.push(comments.onDidMutate(() => deps.panel.invalidate(['comments', 'reviewThreads'])));
}

function activeView(context: vscode.ExtensionContext, active: ActiveWorkspace) {
  const emitter = new vscode.EventEmitter<WorkspaceState | undefined>();
  context.subscriptions.push(
    emitter,
    active.onDidChange(() => emitter.fire(undefined)),
    active.onDidChangeState((state) => emitter.fire(state)),
  );
  return {
    get workspace() {
      return active.ref;
    },
    get poller() {
      return active.poller;
    },
    onDidChange: emitter.event,
  };
}

async function promptForMissingToken(tokens: TokenStore): Promise<void> {
  if ((await tokens.get()) !== undefined) {
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    'Governed Workflow needs an admin token to talk to the admin panel.',
    SET_TOKEN_ACTION,
  );
  if (choice === SET_TOKEN_ACTION) {
    await vscode.commands.executeCommand(COMMAND_IDS.setToken);
  }
}
