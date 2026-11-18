import type * as vscode from 'vscode';
import type { WorkspaceRef } from '../api/types';
import { commentPathOf } from '../comments/commentPaths';
import type { WorkspaceSnapshot } from '../diff/diffView';
import { GIT_SCHEME } from '../fs/gitUris';
import { BASE_FILE_SCHEME, InvalidWorkflowUriError, parseBaseFileUri } from '../fs/uris';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import { splitRepoPath } from '../shared/paths';

const PRIMARY_REPO = '';
const ROOT_REPO_ALIAS = '.';
const WORKING_TREE_REF = '';
const MULTI_REPO_PROJECT = 'multi';

// The file an annotation request addresses: the repository-relative path inside one repository of the
// workspace, read at a git ref, or from the working tree when the ref is empty.
export interface AnnotationTarget {
  readonly workspace: WorkspaceRef;
  readonly repo: string;
  readonly filePath: string;
  readonly ref: string;
}

export type ModifiedSidePredicate = (uri: vscode.Uri) => boolean;

export function annotationTargetOf(
  uri: vscode.Uri,
  snapshot: WorkspaceSnapshot,
  locator: WorkspaceLocator,
  isModifiedSide: ModifiedSidePredicate,
): AnnotationTarget | undefined {
  // A built-in Git document maps to its working-tree path for comments, but its content is another version of
  // the file, so working-tree annotations would land on the wrong lines.
  if (uri.scheme === GIT_SCHEME) {
    return undefined;
  }
  try {
    if (uri.scheme === BASE_FILE_SCHEME) {
      return isModifiedSide(uri) ? refTarget(uri, snapshot) : undefined;
    }
    const workspacePath = commentPathOf(uri, snapshot, locator);
    return workspacePath === undefined ? undefined : workingTreeTarget(workspacePath, snapshot);
  } catch (error) {
    if (error instanceof InvalidWorkflowUriError) {
      return undefined;
    }
    throw error;
  }
}

export function targetKey(target: AnnotationTarget): string {
  return [target.workspace.projectId, target.workspace.branch, target.repo, target.filePath, target.ref].join('\u0000');
}

export function isWorkingTreeTarget(target: AnnotationTarget): boolean {
  return target.ref === WORKING_TREE_REF;
}

// Multi-repo workspaces have no repository at the working dir: every file lives one directory below it.
function workingTreeTarget(workspacePath: string, snapshot: WorkspaceSnapshot): AnnotationTarget | undefined {
  if (snapshot.state.project_type !== MULTI_REPO_PROJECT) {
    return { workspace: snapshot.workspace, repo: PRIMARY_REPO, filePath: workspacePath, ref: WORKING_TREE_REF };
  }
  const { repo, relPath } = splitRepoPath(workspacePath);
  return repo === undefined ? undefined : { workspace: snapshot.workspace, repo, filePath: relPath, ref: WORKING_TREE_REF };
}

function refTarget(uri: vscode.Uri, snapshot: WorkspaceSnapshot): AnnotationTarget | undefined {
  const location = parseBaseFileUri(uri);
  const { projectId, branch } = snapshot.workspace;
  if (location.workspace.projectId !== projectId || location.workspace.branch !== branch || location.relPath === '') {
    return undefined;
  }
  return { workspace: snapshot.workspace, repo: normalizeRepo(location.repo), filePath: location.relPath, ref: location.baseRef };
}

function normalizeRepo(repo: string | undefined): string {
  const trimmed = (repo ?? PRIMARY_REPO).replace(/\/+$/, '');
  return trimmed === ROOT_REPO_ALIAS ? PRIMARY_REPO : trimmed;
}
