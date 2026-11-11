import type * as vscode from 'vscode';
import type { WorkspaceRef } from '../api/types';

const SELECTED_WORKSPACE_KEY = 'governedWorkflow.selectedWorkspace';

export class WindowSelectionMemory {
  constructor(private readonly workspaceState: vscode.Memento) {}

  remembered(): WorkspaceRef | undefined {
    const stored = this.workspaceState.get<unknown>(SELECTED_WORKSPACE_KEY);
    return isWorkspaceRef(stored) ? { projectId: stored.projectId, branch: stored.branch } : undefined;
  }

  remember(ref: WorkspaceRef): Thenable<void> {
    return this.workspaceState.update(SELECTED_WORKSPACE_KEY, { projectId: ref.projectId, branch: ref.branch });
  }
}

export function isWorkspaceRef(value: unknown): value is WorkspaceRef {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.projectId === 'string' && typeof candidate.branch === 'string';
}
