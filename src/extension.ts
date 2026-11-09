import * as vscode from 'vscode';
import { ApiClient } from './api/client';
import type { WorkspaceState } from './api/types';
import { registerAnnotations } from './annotations/annotationProvider';
import { COMMAND_IDS, registerWorkspaceCommands } from './commands/workspaceCommands';
import { registerGateCommands } from './commands/gateCommands';
import { registerReviewComments } from './comments/reviewComments';
import { Settings } from './config/settings';
import { TokenStore } from './config/tokenStore';
import { registerChangesTree } from './diff/changesTree';
import { BaseContentProvider } from './fs/baseContentProvider';
import { RemoteFileSystem } from './fs/remoteFileSystem';
import { BASE_FILE_SCHEME, REMOTE_FILE_SCHEME } from './fs/uris';
import { WorkspaceLocator } from './fs/workspaceLocator';
import { ActiveWorkspace } from './state/activeWorkspace';
import { registerClaudeTerminal } from './terminal/claudeTerminal';
import { registerProjectsTree } from './views/projectsTree';
import { MarkdownDocProvider, registerMarkdownDocs } from './views/markdownDocs';
import { registerStateTree } from './views/stateTree';

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
  const docs = new MarkdownDocProvider();
  context.subscriptions.push(settings, active);

  registerVirtualFileSystems(context, client);
  registerMarkdownDocs(context, { docs });
  const projectsTree = registerProjectsTree(context, { client });
  registerStateTree(context, { client, active, docs });
  registerWorkspaceCommands(context, { client, active, tokens, locator, projectsTree });
  registerChangesTree(context, { client, locator, active });
  registerReviewComments(context, { client, locator, active });
  registerClaudeTerminal(context, { client, activeWorkspace: view });
  registerGateCommands(context, { client, active: view });
  registerAnnotations(context);

  void promptForMissingToken(tokens);
}

export function deactivate(): void {}

function registerVirtualFileSystems(context: vscode.ExtensionContext, client: ApiClient): void {
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(REMOTE_FILE_SCHEME, new RemoteFileSystem(client), {
      isReadonly: true,
      isCaseSensitive: true,
    }),
    vscode.workspace.registerTextDocumentContentProvider(BASE_FILE_SCHEME, new BaseContentProvider(client)),
  );
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
