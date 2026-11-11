import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { WorkspaceRef, WorkspaceSummary } from '../api/types';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import { windowFolderPaths } from './windowFolders';
import type { WindowSelectionMemory } from './windowSelectionMemory';
import type { WorkspaceSelector } from './workspaceSelector';
import type { WorktreeHandoff } from './worktreeHandoff';
import { findWorkspaceForFolders, projectsContainingFolders, type WorkspaceLocation } from './worktreePaths';

export interface WindowAssociationDeps {
  readonly client: ApiClient;
  readonly active: ActiveWorkspace;
  readonly selector: WorkspaceSelector;
  readonly handoff: WorktreeHandoff;
  readonly memory: WindowSelectionMemory;
}

export function registerWindowAssociation(context: vscode.ExtensionContext, deps: WindowAssociationDeps): void {
  context.subscriptions.push(
    deps.active.onDidChange((ref) => {
      if (ref !== undefined) {
        void deps.memory.remember(ref);
      }
    }),
  );
  void associateWindow(deps, windowFolderPaths());
}

async function associateWindow(deps: WindowAssociationDeps, folders: readonly string[]): Promise<void> {
  const handedOff = folders.length === 0 ? undefined : await deps.handoff.take(folders);
  if (handedOff !== undefined) {
    await selectUnlessChosen(deps, () => deps.selector.selectInThisWindow(handedOff.ref, handedOff.nav));
    return;
  }
  const ref = deps.memory.remembered() ?? (await lookupWorkspaceQuietly(deps.client, folders));
  if (ref !== undefined) {
    await selectUnlessChosen(deps, async () => deps.active.select(ref));
  }
}

async function selectUnlessChosen(deps: WindowAssociationDeps, select: () => Promise<void>): Promise<void> {
  if (deps.active.ref === undefined) {
    await select();
  }
}

// Association is a convenience on startup: an unreachable panel or a missing token is already reported by the token prompt and the Projects view.
async function lookupWorkspaceQuietly(client: ApiClient, folders: readonly string[]): Promise<WorkspaceRef | undefined> {
  try {
    return await lookupWorkspace(client, folders);
  } catch (error) {
    if (error instanceof ApiError) {
      return undefined;
    }
    throw error;
  }
}

async function lookupWorkspace(client: ApiClient, folders: readonly string[]): Promise<WorkspaceRef | undefined> {
  if (folders.length === 0) {
    return undefined;
  }
  const candidates = projectsContainingFolders(await client.listProjects(), folders);
  for (const project of candidates) {
    const match = findWorkspaceForFolders(toLocations(project.id, await client.listWorkspaces(project.id)), folders);
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
}

function toLocations(projectId: string, workspaces: readonly WorkspaceSummary[]): WorkspaceLocation[] {
  return workspaces.map((workspace) => ({
    ref: { projectId, branch: workspace.branch },
    workingDir: workspace.working_dir,
    status: workspace.status,
  }));
}
