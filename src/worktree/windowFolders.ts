import * as vscode from 'vscode';

const FILE_SCHEME = 'file';

export function windowFolderPaths(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).filter((folder) => folder.uri.scheme === FILE_SCHEME).map((folder) => folder.uri.fsPath);
}
