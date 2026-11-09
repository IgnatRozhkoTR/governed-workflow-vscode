import type { WorkspaceRef } from '../api/types';

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
