import type * as vscode from 'vscode';
import { ApiError } from '../api/errors';
import type { WorkspaceSnapshot } from '../diff/diffView';
import { BASE_FILE_SCHEME, REMOTE_FILE_SCHEME, parseBaseFileUri } from '../fs/uris';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import { joinRepoPath } from '../shared/paths';

const LOCAL_FILE_SCHEME = 'file';

// Diff base documents are commentable as well: the web keeps no side on a line comment, so a comment on
// an old-side line stores the old line number and hash, and line_hash relocation places it on the working tree.
export function commentPathOf(uri: vscode.Uri, snapshot: WorkspaceSnapshot, locator: WorkspaceLocator): string | undefined {
  switch (uri.scheme) {
    case LOCAL_FILE_SCHEME:
      return locator.relPathOf(uri, snapshot.state);
    case REMOTE_FILE_SCHEME:
      return uri.authority === snapshot.workspace.projectId ? locator.relPathOf(uri, snapshot.state) : undefined;
    case BASE_FILE_SCHEME:
      return baseDocumentPath(uri, snapshot);
    default:
      return undefined;
  }
}

export function requireCommentPath(uri: vscode.Uri, snapshot: WorkspaceSnapshot, locator: WorkspaceLocator): string {
  const relPath = commentPathOf(uri, snapshot, locator);
  if (relPath === undefined) {
    throw new ApiError(0, 'not_commentable', 'Comments can only be added to files of the active workspace.');
  }
  return relPath;
}

function baseDocumentPath(uri: vscode.Uri, snapshot: WorkspaceSnapshot): string | undefined {
  const location = parseBaseFileUri(uri);
  const { projectId, branch } = snapshot.workspace;
  if (location.workspace.projectId !== projectId || location.workspace.branch !== branch) {
    return undefined;
  }
  return joinRepoPath(location.repo, location.relPath);
}
