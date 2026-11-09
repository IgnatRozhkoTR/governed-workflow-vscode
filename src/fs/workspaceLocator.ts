import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { WorkspaceRef, WorkspaceState } from '../api/types';
import {
  BASE_FILE_SCHEME,
  REMOTE_FILE_SCHEME,
  parseBaseFileUri,
  parseRemoteFileUri,
  remoteFileUriParts,
  type RemoteFileLocation,
} from './uris';

export class WorkspaceLocator {
  isLocal(state: WorkspaceState): boolean {
    return state.working_dir !== '' && fs.existsSync(state.working_dir);
  }

  fileUri(workspace: WorkspaceRef, state: WorkspaceState, relPath: string): vscode.Uri {
    if (this.isLocal(state)) {
      return vscode.Uri.file(path.join(state.working_dir, relPath));
    }
    return vscode.Uri.from(remoteFileUriParts({ workspace, relPath }));
  }

  relPathOf(uri: vscode.Uri, state: WorkspaceState): string | undefined {
    switch (uri.scheme) {
      case 'file':
        return localRelPath(uri, state);
      case REMOTE_FILE_SCHEME:
        return remoteRelPath(parseRemoteFileUri(uri), state);
      case BASE_FILE_SCHEME:
        return remoteRelPath(parseBaseFileUri(uri), state);
      default:
        return undefined;
    }
  }
}

function localRelPath(uri: vscode.Uri, state: WorkspaceState): string | undefined {
  const relative = path.relative(state.working_dir, uri.fsPath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }
  return relative.split(path.sep).join('/');
}

function remoteRelPath(location: RemoteFileLocation, state: WorkspaceState): string | undefined {
  return location.workspace.branch === state.branch ? location.relPath : undefined;
}
