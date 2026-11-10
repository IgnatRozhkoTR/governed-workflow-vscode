import type { WorkspaceRef } from '../api/types';

const ROOT_REPO = '.';

export interface RepoPath {
  readonly repo?: string;
  readonly relPath: string;
}

export function encodeBranchPath(branch: string): string {
  return branch.split('/').map(encodeURIComponent).join('/');
}

export function wsPath(workspace: WorkspaceRef, suffix: string): string {
  const project = encodeURIComponent(workspace.projectId);
  return `/api/ws/${project}/${encodeBranchPath(workspace.branch)}/${suffix}`;
}

export function projectPath(projectId: string, suffix: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/${suffix}`;
}

// Comment targets and file URIs address a file inside an inner repository as "<repo>/<path>" from the working dir.
export function joinRepoPath(repo: string | undefined, relPath: string): string {
  const repoDir = (repo ?? '').replace(/\/+$/, '');
  if (repoDir === '' || repoDir === ROOT_REPO) {
    return relPath;
  }
  return `${repoDir}/${relPath.replace(/^\/+/, '')}`;
}

// Multi-repo workspaces check out every attached repository one directory below the working dir.
export function splitRepoPath(path: string): RepoPath {
  const separator = path.indexOf('/');
  return separator <= 0 ? { relPath: path } : { repo: path.slice(0, separator), relPath: path.slice(separator + 1) };
}
