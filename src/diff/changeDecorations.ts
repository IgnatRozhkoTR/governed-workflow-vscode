import * as vscode from 'vscode';
import type { ChangeKind } from '../shared/protocol';

// Changes view rows get their own scheme so the status letters never leak into the Explorer, and the git
// extension's decorations for the same file never double up in this view.
export const CHANGE_RESOURCE_SCHEME = 'gw-change';
const KIND_PARAMETER = 'kind';

const DECORATIONS: Readonly<Record<ChangeKind, vscode.FileDecoration>> = {
  added: new vscode.FileDecoration('A', 'Added', new vscode.ThemeColor('gitDecoration.addedResourceForeground')),
  modified: new vscode.FileDecoration('M', 'Modified', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground')),
  deleted: new vscode.FileDecoration('D', 'Deleted', new vscode.ThemeColor('gitDecoration.deletedResourceForeground')),
  renamed: new vscode.FileDecoration('R', 'Renamed', new vscode.ThemeColor('gitDecoration.renamedResourceForeground')),
};

export function changeResourceUri(workspacePath: string, kind?: ChangeKind): vscode.Uri {
  const query = kind === undefined ? '' : new URLSearchParams({ [KIND_PARAMETER]: kind }).toString();
  return vscode.Uri.from({ scheme: CHANGE_RESOURCE_SCHEME, path: `/${workspacePath}`, query });
}

export class ChangeDecorationProvider implements vscode.FileDecorationProvider {
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== CHANGE_RESOURCE_SCHEME) {
      return undefined;
    }
    const kind = new URLSearchParams(uri.query).get(KIND_PARAMETER);
    return isChangeKind(kind) ? DECORATIONS[kind] : undefined;
  }
}

function isChangeKind(value: string | null): value is ChangeKind {
  return value !== null && Object.hasOwn(DECORATIONS, value);
}
