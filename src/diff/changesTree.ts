import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { DiffRepo, WorkspaceRef, WorkspaceState } from '../api/types';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import type { ChangeKind, OpenAllChangesArgs } from '../shared/protocol';
import { ChangeDecorationProvider, changeResourceUri } from './changeDecorations';
import {
  buildChangeNodes,
  countChangedFiles,
  type ChangeFileNode,
  type ChangeFolderNode,
  type ChangeNode,
  type ChangeRepoNode,
  type ChangesLayout,
  type RepoChanges,
  type WorkingTreeMode,
} from './changesModel';
import { ChangesViewMemory } from './changesViewMemory';
import {
  DIFF_SHOW_OPTIONS,
  openAllChangesAcross,
  openDiffFor,
  registerEmptyDocumentProvider,
  runWithErrorMessage,
  toDiffFileRef,
  type WorkspaceSnapshot,
} from './diffView';

export const CHANGES_VIEW_ID = 'governedWorkflow.changes';
export const OPEN_FILE_DIFF_COMMAND = 'governedWorkflow.openFileDiff';
export const OPEN_CHANGES_COMMAND = 'governedWorkflow.openChanges';
export const SHOW_BRANCH_CHANGES_COMMAND = 'governedWorkflow.changes.showBranch';
export const SHOW_UNCOMMITTED_CHANGES_COMMAND = 'governedWorkflow.changes.showUncommitted';
export const VIEW_CHANGES_AS_TREE_COMMAND = 'governedWorkflow.changes.viewAsTree';
export const VIEW_CHANGES_AS_LIST_COMMAND = 'governedWorkflow.changes.viewAsList';
export const REFRESH_CHANGES_COMMAND = 'governedWorkflow.changes.refresh';
export const OPEN_CHANGED_FILE_COMMAND = 'governedWorkflow.changes.openFile';
export const COPY_CHANGED_PATH_COMMAND = 'governedWorkflow.changes.copyPath';
const MODE_CONTEXT_KEY = 'governedWorkflow.changes.mode';
const LAYOUT_CONTEXT_KEY = 'governedWorkflow.changes.layout';
const LOADED_CONTEXT_KEY = 'governedWorkflow.changes.loaded';
const FILE_CONTEXT = 'gwChangeFile';
const DELETED_FILE_CONTEXT = 'gwChangeFileDeleted';
const FOLDER_CONTEXT = 'gwChangeFolder';
const ROOT_REPO = '.';

const KIND_LABELS: Readonly<Record<ChangeKind, string>> = { added: 'Added', modified: 'Modified', deleted: 'Deleted', renamed: 'Renamed' };

export interface ChangesWorkspaceSource {
  readonly ref: WorkspaceRef | undefined;
  readonly state: WorkspaceState | undefined;
  readonly onDidChange: vscode.Event<unknown>;
  readonly onDidChangeState: vscode.Event<WorkspaceState>;
}

export interface ChangesTreeDeps {
  readonly client: ApiClient;
  readonly locator: WorkspaceLocator;
  readonly active: ChangesWorkspaceSource;
}

interface MessageNode {
  readonly type: 'message';
  readonly id: string;
  readonly text: string;
}

export type ChangesTreeNode = ChangeNode | MessageNode;

type LoadedChanges =
  | { readonly status: 'idle' }
  | { readonly status: 'loaded'; readonly repos: readonly RepoChanges[] }
  | { readonly status: 'failed'; readonly message: string };

const IDLE: LoadedChanges = { status: 'idle' };

export class ChangesTreeProvider implements vscode.TreeDataProvider<ChangesTreeNode>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly subscriptions: vscode.Disposable[];
  private loaded: LoadedChanges = IDLE;
  private roots: ChangesTreeNode[] = [];
  private isVisible = false;
  private isStale = true;
  private loadSequence = 0;

  readonly onDidChangeTreeData: vscode.Event<void> = this.changeEmitter.event;

  constructor(
    private readonly client: ApiClient,
    private readonly active: ChangesWorkspaceSource,
    private readonly memory: ChangesViewMemory,
  ) {
    this.subscriptions = [
      active.onDidChange(() => this.followWorkspaceSwitch()),
      active.onDidChangeState(() => this.invalidate()),
    ];
  }

  get mode(): WorkingTreeMode {
    return this.memory.mode;
  }

  get layout(): ChangesLayout {
    return this.memory.layout;
  }

  get isLoaded(): boolean {
    return this.loaded.status === 'loaded';
  }

  get fileCount(): number {
    return this.loaded.status === 'loaded' ? countChangedFiles(this.loaded.repos) : 0;
  }

  get summary(): string {
    if (this.mode === 'uncommitted') {
      return 'uncommitted';
    }
    const bases = this.loaded.status === 'loaded' ? distinctBases(this.loaded.repos) : [];
    return bases.length === 0 ? 'branch' : `vs ${bases.join(', ')}`;
  }

  get changeGroups(): OpenAllChangesArgs[] {
    const repos = this.loaded.status === 'loaded' ? this.loaded.repos : [];
    return repos
      .filter((entry) => entry.files.length > 0)
      .map((entry) => ({ source: entry.source, files: entry.files.map(toDiffFileRef) }));
  }

  getTreeItem(node: ChangesTreeNode): vscode.TreeItem {
    return changeTreeItem(node);
  }

  getChildren(node?: ChangesTreeNode): ChangesTreeNode[] {
    if (node === undefined) {
      return this.roots;
    }
    return node.type === 'repo' || node.type === 'folder' ? [...node.children] : [];
  }

  setVisible(isVisible: boolean): void {
    this.isVisible = isVisible;
    this.reloadIfStaleAndVisible();
  }

  invalidate(): void {
    this.isStale = true;
    this.reloadIfStaleAndVisible();
  }

  async setMode(mode: WorkingTreeMode): Promise<void> {
    await this.memory.setMode(mode);
    this.loadSequence++;
    this.show(IDLE);
    this.invalidate();
  }

  async setLayout(layout: ChangesLayout): Promise<void> {
    await this.memory.setLayout(layout);
    this.show(this.loaded);
  }

  async reload(): Promise<void> {
    const sequence = ++this.loadSequence;
    this.isStale = false;
    const workspace = this.active.ref;
    const loaded = workspace === undefined ? IDLE : await this.loadWithProgress(workspace, this.mode);
    if (sequence === this.loadSequence) {
      this.show(loaded);
    }
  }

  dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.changeEmitter.dispose();
  }

  private followWorkspaceSwitch(): void {
    this.loadSequence++;
    this.show(IDLE);
    this.invalidate();
  }

  private reloadIfStaleAndVisible(): void {
    if (this.isVisible && this.isStale) {
      void this.reload();
    }
  }

  private show(loaded: LoadedChanges): void {
    this.loaded = loaded;
    this.roots = rootNodesFor(loaded, this.layout);
    this.changeEmitter.fire();
  }

  private loadWithProgress(workspace: WorkspaceRef, mode: WorkingTreeMode): Thenable<LoadedChanges> {
    return vscode.window.withProgress({ location: { viewId: CHANGES_VIEW_ID } }, () => this.fetchChanges(workspace, mode));
  }

  private async fetchChanges(workspace: WorkspaceRef, mode: WorkingTreeMode): Promise<LoadedChanges> {
    try {
      const repos = await this.client.listRepos(workspace);
      return { status: 'loaded', repos: await Promise.all(repos.map((entry) => this.fetchRepo(workspace, mode, entry))) };
    } catch (error) {
      if (error instanceof ApiError) {
        return { status: 'failed', message: error.message };
      }
      throw error;
    }
  }

  private async fetchRepo(workspace: WorkspaceRef, mode: WorkingTreeMode, entry: DiffRepo): Promise<RepoChanges> {
    const repo = entry.path === ROOT_REPO ? undefined : entry.path;
    const response = await this.client.getDiff(workspace, { mode, repo: entry.path });
    const base = mode === 'branch' ? response.base : undefined;
    return { repo, name: entry.name, source: { mode, base, repo }, files: response.files };
  }
}

export function registerChangesTree(context: vscode.ExtensionContext, deps: ChangesTreeDeps): ChangesTreeProvider {
  const provider = new ChangesTreeProvider(deps.client, deps.active, new ChangesViewMemory(context.workspaceState));
  const treeView = vscode.window.createTreeView(CHANGES_VIEW_ID, { treeDataProvider: provider, showCollapseAll: true });
  context.subscriptions.push(
    provider,
    treeView,
    vscode.window.registerFileDecorationProvider(new ChangeDecorationProvider()),
    registerEmptyDocumentProvider(),
    provider.onDidChangeTreeData(() => presentView(treeView, provider)),
    treeView.onDidChangeVisibility((event) => provider.setVisible(event.visible)),
    ...registerChangesCommands({ locator: deps.locator, active: deps.active, provider }),
  );
  presentView(treeView, provider);
  provider.setVisible(treeView.visible);
  return provider;
}

export interface ChangesCommandDeps {
  readonly locator: WorkspaceLocator;
  readonly active: ChangesWorkspaceSource;
  readonly provider: ChangesTreeProvider;
}

function registerChangesCommands(deps: ChangesCommandDeps): vscode.Disposable[] {
  const { provider } = deps;
  return [
    registerFileCommand(OPEN_FILE_DIFF_COMMAND, (node) => openChangeDiff(deps, node)),
    registerFileCommand(OPEN_CHANGED_FILE_COMMAND, (node) => openChangedFile(deps, node)),
    registerFileCommand(COPY_CHANGED_PATH_COMMAND, (node) => copyChangedPath(deps, node)),
    vscode.commands.registerCommand(OPEN_CHANGES_COMMAND, () => runWithErrorMessage(() => openAllLoadedChanges(deps))),
    vscode.commands.registerCommand(SHOW_BRANCH_CHANGES_COMMAND, () => provider.setMode('branch')),
    vscode.commands.registerCommand(SHOW_UNCOMMITTED_CHANGES_COMMAND, () => provider.setMode('uncommitted')),
    vscode.commands.registerCommand(VIEW_CHANGES_AS_TREE_COMMAND, () => provider.setLayout('tree')),
    vscode.commands.registerCommand(VIEW_CHANGES_AS_LIST_COMMAND, () => provider.setLayout('list')),
    vscode.commands.registerCommand(REFRESH_CHANGES_COMMAND, () => provider.reload()),
  ];
}

function registerFileCommand(command: string, action: (node: ChangeFileNode) => Promise<void>): vscode.Disposable {
  return vscode.commands.registerCommand(command, (node?: ChangesTreeNode) => {
    if (node?.type !== 'file') {
      void vscode.window.showInformationMessage('Select a changed file in the Changes view first.');
      return;
    }
    return runWithErrorMessage(() => action(node));
  });
}

export function openChangeDiff(deps: ChangesCommandDeps, node: ChangeFileNode): Promise<void> {
  return openDiffFor(deps.locator, requireSnapshot(deps.active), { source: node.source, file: toDiffFileRef(node.file) });
}

export async function openAllLoadedChanges(deps: ChangesCommandDeps): Promise<void> {
  const groups = deps.provider.changeGroups;
  if (groups.length === 0) {
    void vscode.window.showInformationMessage('There are no changes to show.');
    return;
  }
  await openAllChangesAcross(deps.locator, requireSnapshot(deps.active), groups);
}

async function openChangedFile(deps: ChangesCommandDeps, node: ChangeFileNode): Promise<void> {
  const { workspace, state } = requireSnapshot(deps.active);
  const uri = deps.locator.fileUri(workspace, state, node.workspacePath);
  await vscode.window.showTextDocument(uri, { viewColumn: DIFF_SHOW_OPTIONS.viewColumn, preview: false });
}

async function copyChangedPath(deps: ChangesCommandDeps, node: ChangeFileNode): Promise<void> {
  const { state } = requireSnapshot(deps.active);
  const pathApi = deps.locator.isLocal(state) ? path : path.posix;
  await vscode.env.clipboard.writeText(pathApi.join(state.working_dir, node.workspacePath));
}

function requireSnapshot(active: ChangesWorkspaceSource): WorkspaceSnapshot {
  const { ref: workspace, state } = active;
  if (workspace === undefined || state === undefined) {
    throw new ApiError(0, 'workspace_not_loaded', 'The workspace state has not loaded yet. Try again in a moment.');
  }
  return { workspace, state };
}

function presentView(treeView: vscode.TreeView<ChangesTreeNode>, provider: ChangesTreeProvider): void {
  const count = provider.fileCount;
  treeView.badge = count > 0 ? { value: count, tooltip: `${count} changed files` } : undefined;
  treeView.description = provider.summary;
  void vscode.commands.executeCommand('setContext', MODE_CONTEXT_KEY, provider.mode);
  void vscode.commands.executeCommand('setContext', LAYOUT_CONTEXT_KEY, provider.layout);
  void vscode.commands.executeCommand('setContext', LOADED_CONTEXT_KEY, provider.isLoaded);
}

function rootNodesFor(loaded: LoadedChanges, layout: ChangesLayout): ChangesTreeNode[] {
  switch (loaded.status) {
    case 'idle':
      return [];
    case 'failed':
      return [{ type: 'message', id: 'message', text: `Cannot load changes: ${loaded.message}` }];
    case 'loaded':
      return buildChangeNodes(loaded.repos, layout);
  }
}

function distinctBases(repos: readonly RepoChanges[]): string[] {
  return [...new Set(repos.flatMap((entry) => (entry.source.base ? [entry.source.base] : [])))];
}

export function changeTreeItem(node: ChangesTreeNode): vscode.TreeItem {
  switch (node.type) {
    case 'file':
      return fileItem(node);
    case 'folder':
      return folderItem(node);
    case 'repo':
      return repoItem(node);
    case 'message':
      return messageItem(node);
  }
}

function fileItem(node: ChangeFileNode): vscode.TreeItem {
  const item = new vscode.TreeItem(path.posix.basename(node.file.path), vscode.TreeItemCollapsibleState.None);
  item.id = node.id;
  item.resourceUri = changeResourceUri(node.workspacePath, node.kind);
  item.description = [node.directory, `+${node.file.additions} −${node.file.deletions}`].filter(Boolean).join('  ');
  item.tooltip = `${node.file.old_path ? `${node.file.old_path} → ` : ''}${node.workspacePath} • ${KIND_LABELS[node.kind]}`;
  item.contextValue = node.kind === 'deleted' ? DELETED_FILE_CONTEXT : FILE_CONTEXT;
  item.command = { command: OPEN_FILE_DIFF_COMMAND, title: 'Open Diff', arguments: [node] };
  return item;
}

function folderItem(node: ChangeFolderNode): vscode.TreeItem {
  const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
  item.id = node.id;
  item.resourceUri = changeResourceUri(node.workspacePath);
  item.iconPath = vscode.ThemeIcon.Folder;
  item.tooltip = node.workspacePath;
  item.contextValue = FOLDER_CONTEXT;
  return item;
}

function repoItem(node: ChangeRepoNode): vscode.TreeItem {
  const item = new vscode.TreeItem(node.repo.name, vscode.TreeItemCollapsibleState.Expanded);
  item.id = node.id;
  item.iconPath = new vscode.ThemeIcon('repo');
  item.description = node.repo.source.base ? `vs ${node.repo.source.base}` : undefined;
  item.tooltip = node.repo.repo ?? ROOT_REPO;
  return item;
}

function messageItem(node: MessageNode): vscode.TreeItem {
  const item = new vscode.TreeItem(node.text);
  item.id = node.id;
  item.iconPath = new vscode.ThemeIcon('warning');
  return item;
}
