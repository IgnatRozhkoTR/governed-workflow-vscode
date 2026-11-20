import type * as vscode from 'vscode';
import type { WorkspaceRef } from '../api/types';
import type { ChangesLayout, WorkingTreeMode } from './changesModel';

const MODE_KEY = 'governedWorkflow.changes.mode';
const LAYOUT_KEY = 'governedWorkflow.changes.layout';
const BASE_OVERRIDES_KEY = 'governedWorkflow.changes.baseOverrides';
const REPO_FILTERS_KEY = 'governedWorkflow.changes.repoFilters';

type StoredRecord = Readonly<Record<string, string>>;

export class ChangesViewMemory {
  constructor(private readonly storage: vscode.Memento) {}

  get mode(): WorkingTreeMode {
    return this.storage.get<string>(MODE_KEY) === 'uncommitted' ? 'uncommitted' : 'branch';
  }

  get layout(): ChangesLayout {
    return this.storage.get<string>(LAYOUT_KEY) === 'list' ? 'list' : 'tree';
  }

  async setMode(mode: WorkingTreeMode): Promise<void> {
    await this.storage.update(MODE_KEY, mode);
  }

  async setLayout(layout: ChangesLayout): Promise<void> {
    await this.storage.update(LAYOUT_KEY, layout);
  }

  baseOverride(workspace: WorkspaceRef, repoPath: string): string | undefined {
    return this.record(BASE_OVERRIDES_KEY)[repoKey(workspace, repoPath)];
  }

  async setBaseOverride(workspace: WorkspaceRef, repoPath: string, base: string | undefined): Promise<void> {
    await this.updateRecord(BASE_OVERRIDES_KEY, repoKey(workspace, repoPath), base);
  }

  repoFilter(workspace: WorkspaceRef): string | undefined {
    return this.record(REPO_FILTERS_KEY)[workspaceKey(workspace)];
  }

  async setRepoFilter(workspace: WorkspaceRef, repoPath: string | undefined): Promise<void> {
    await this.updateRecord(REPO_FILTERS_KEY, workspaceKey(workspace), repoPath);
  }

  private record(key: string): StoredRecord {
    return this.storage.get<StoredRecord>(key) ?? {};
  }

  private async updateRecord(key: string, entryKey: string, value: string | undefined): Promise<void> {
    const { [entryKey]: _previous, ...others } = this.record(key);
    await this.storage.update(key, value === undefined ? others : { ...others, [entryKey]: value });
  }
}

function workspaceKey(workspace: WorkspaceRef): string {
  return JSON.stringify([workspace.projectId, workspace.branch]);
}

function repoKey(workspace: WorkspaceRef, repoPath: string): string {
  return JSON.stringify([workspace.projectId, workspace.branch, repoPath]);
}
