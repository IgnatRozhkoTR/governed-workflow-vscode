import * as vscode from 'vscode';

const SSH_REMOTE_NAME = 'ssh-remote';
const REMOTE_SECTION = 'remote';
// VS Code installs these from the local copy (zipped, so a VSIX install works too) when a remote window connects;
// remote.SSH.defaultExtensions would only try the marketplace, where this extension is not published.
const DEFAULT_EXTENSIONS_IF_INSTALLED_LOCALLY = 'defaultExtensionsIfInstalledLocally';
const RELOAD_WINDOW_COMMAND = 'workbench.action.reloadWindow';
const INSTALL_LOCAL_EXTENSIONS_IN_REMOTE_COMMAND = 'workbench.extensions.installLocalExtensions';
const RELOAD_ACTION = 'Reload Window';
const INSTALL_ACTION = 'Install on SSH Host...';

export async function ensureInstalledOnSshHosts(extensionId: string): Promise<void> {
  const configuration = vscode.workspace.getConfiguration(REMOTE_SECTION);
  const configured = configuration.inspect<unknown>(DEFAULT_EXTENSIONS_IF_INSTALLED_LOCALLY)?.globalValue;
  const updated = withExtensionId(configured, extensionId);
  if (updated !== undefined) {
    await configuration.update(DEFAULT_EXTENSIONS_IF_INSTALLED_LOCALLY, updated, vscode.ConfigurationTarget.Global);
  }
}

export function withExtensionId(configured: unknown, extensionId: string): string[] | undefined {
  const ids = Array.isArray(configured) ? configured.filter((id): id is string => typeof id === 'string') : [];
  const isListed = ids.some((id) => id.toLowerCase() === extensionId.toLowerCase());
  return isListed ? undefined : [...ids, extensionId];
}

export function isRunningOnSshClientSide(remoteName: string | undefined, extensionKind: vscode.ExtensionKind): boolean {
  return remoteName === SSH_REMOTE_NAME && extensionKind === vscode.ExtensionKind.UI;
}

// The first window on a new SSH host starts this extension on the client before VS Code finishes copying it to the host,
// and only a reload moves it next to the worktrees.
export function registerSshHostCheck(context: vscode.ExtensionContext): void {
  if (isRunningOnSshClientSide(vscode.env.remoteName, context.extension.extensionKind)) {
    void offerToMoveToSshHost(context.extension.id);
  }
}

async function offerToMoveToSshHost(extensionId: string): Promise<void> {
  await ensureInstalledOnSshHosts(extensionId);
  const choice = await vscode.window.showInformationMessage(
    'Governed Workflow is running on this computer instead of the SSH host, so it cannot open the worktree files directly. ' +
      'VS Code copies it to the SSH host on connect; reload the window to run it there. If it still runs here after the reload, install it on the SSH host.',
    RELOAD_ACTION,
    INSTALL_ACTION,
  );
  if (choice === RELOAD_ACTION) {
    await vscode.commands.executeCommand(RELOAD_WINDOW_COMMAND);
  } else if (choice === INSTALL_ACTION) {
    await vscode.commands.executeCommand(INSTALL_LOCAL_EXTENSIONS_IN_REMOTE_COMMAND);
  }
}
