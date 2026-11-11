import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { WorkspaceRef, WorkspaceState } from '../api/types';
import type { NavTarget } from '../shared/navigation';
import type { Settings } from '../config/settings';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import type { OnSelectWorkspace } from './onSelectWorkspace';
import type { SshOpenOutcome, SshWorktreeOpener } from './sshWorktreeOpener';
import { windowFolderPaths } from './windowFolders';
import type { WorktreeHandoff } from './worktreeHandoff';
import { isWindowOnWorktree } from './worktreePaths';

const OPEN_CONTROL_PANEL_COMMAND = 'governedWorkflow.openControlPanel';

type OpeningBehaviour = Exclude<OnSelectWorkspace, 'off'>;

export interface WorkspaceSelectorDeps {
  readonly client: ApiClient;
  readonly active: ActiveWorkspace;
  readonly locator: WorkspaceLocator;
  readonly settings: Settings;
  readonly handoff: WorktreeHandoff;
  readonly sshOpener: SshWorktreeOpener;
}

export class WorkspaceSelector {
  private hasExplainedRemoteWorktrees = false;

  constructor(private readonly deps: WorkspaceSelectorDeps) {}

  async select(ref: WorkspaceRef, nav?: NavTarget): Promise<void> {
    const behaviour = this.deps.settings.onSelectWorkspace;
    const state = behaviour === 'off' ? undefined : await this.fetchState(ref);
    if (behaviour === 'off' || state === undefined) {
      await this.selectInThisWindow(ref, nav);
    } else if (this.deps.locator.isLocal(state)) {
      await this.openLocalWorktree(behaviour, ref, state.working_dir, nav);
    } else {
      await this.openRemoteWorktree(behaviour, ref, state.working_dir, nav);
    }
  }

  async selectInThisWindow(ref: WorkspaceRef, nav?: NavTarget): Promise<void> {
    this.deps.active.select(ref);
    await vscode.commands.executeCommand(OPEN_CONTROL_PANEL_COMMAND, nav);
  }

  private async openLocalWorktree(behaviour: OpeningBehaviour, ref: WorkspaceRef, workingDir: string, nav?: NavTarget): Promise<void> {
    if (isWindowOnWorktree(windowFolderPaths(), workingDir)) {
      await this.selectInThisWindow(ref, nav);
      return;
    }
    await this.openWorktree(behaviour, ref, workingDir, nav);
  }

  private async openRemoteWorktree(behaviour: OpeningBehaviour, ref: WorkspaceRef, worktreePath: string, nav?: NavTarget): Promise<void> {
    const outcome = await this.deps.sshOpener.open(ref, worktreePath, behaviour, nav);
    if (outcome === 'opened') {
      return;
    }
    this.explainRemoteWorktree(ref, outcome);
    await this.selectInThisWindow(ref, nav);
  }

  // An unreachable panel or a missing token still selects the workspace: the panel's connection banner reports the same error.
  private async fetchState(ref: WorkspaceRef): Promise<WorkspaceState | undefined> {
    try {
      const fetched = await this.deps.client.getState(ref);
      return fetched.notModified ? undefined : fetched.state;
    } catch (error) {
      if (error instanceof ApiError) {
        return undefined;
      }
      throw error;
    }
  }

  private explainRemoteWorktree(ref: WorkspaceRef, outcome: Exclude<SshOpenOutcome, 'opened'>): void {
    if (this.hasExplainedRemoteWorktrees) {
      return;
    }
    this.hasExplainedRemoteWorktrees = true;
    const sshHint =
      outcome === 'declined'
        ? ' To open it on the admin panel machine instead, install Remote - SSH (Governed Workflow: Companions); set governedWorkflow.sshHost if SSH needs another host name or user.'
        : '';
    void vscode.window.showInformationMessage(
      `The worktree of ${ref.branch} is not on this machine, so it opens in Workspace Control only. Use Open Worktree to browse its files through the admin panel.${sshHint}`,
    );
  }

  private async openWorktree(behaviour: OpeningBehaviour, ref: WorkspaceRef, workingDir: string, nav?: NavTarget): Promise<void> {
    switch (behaviour) {
      case 'newWindow':
        await this.openFolder(ref, workingDir, true, nav);
        return;
      case 'sameWindow':
        await this.openFolder(ref, workingDir, false, nav);
        return;
      case 'addFolder':
        await this.addFolder(ref, workingDir, nav);
        return;
    }
  }

  private async openFolder(ref: WorkspaceRef, workingDir: string, isNewWindow: boolean, nav?: NavTarget): Promise<void> {
    await this.deps.handoff.offer(workingDir, ref, nav);
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(workingDir), { forceNewWindow: isNewWindow });
  }

  private async addFolder(ref: WorkspaceRef, workingDir: string, nav?: NavTarget): Promise<void> {
    const folderCount = vscode.workspace.workspaceFolders?.length ?? 0;
    // Adding the first folder to an empty window restarts the extension host, so the selection must survive it.
    if (folderCount === 0) {
      await this.deps.handoff.offer(workingDir, ref, nav);
    }
    const isAdded = vscode.workspace.updateWorkspaceFolders(folderCount, 0, { uri: vscode.Uri.file(workingDir), name: ref.branch });
    if (!isAdded) {
      void vscode.window.showWarningMessage(`Could not add the worktree of ${ref.branch} to this window.`);
    }
    await this.selectInThisWindow(ref, nav);
  }
}
