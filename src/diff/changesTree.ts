import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { DiffFile, DiffMode } from '../api/types';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import {
  ActiveStateTracker,
  changeKindOf,
  openAllChanges,
  openFileDiff,
  registerEmptyDocumentProvider,
  resolveBaseRef,
  runWithErrorMessage,
  workspaceSideUri,
  type ActiveWorkspaceSource,
  type ChangeKind,
  type DiffContext,
  type WorkspaceSnapshot,
} from './diffView';

export const CHANGES_VIEW_ID = 'governedWorkflow.changes';
export const OPEN_FILE_DIFF_COMMAND = 'governedWorkflow.openFileDiff';
export const OPEN_CHANGES_COMMAND = 'governedWorkflow.openChanges';
export const TOGGLE_CHANGES_MODE_COMMAND = 'governedWorkflow.changes.toggleMode';
export const REFRESH_CHANGES_COMMAND = 'governedWorkflow.changes.refresh';
const CHANGE_ITEM_CONTEXT = 'gwChange';
const REPO_REQUIRED_CODE = 'repo_required';
const MULTI_REPO_MESSAGE = 'this multi-repo workspace needs a repository choice, which the Changes view does not support yet.';

const STATUS_LETTERS: Readonly<Record<ChangeKind, string>> = { added: 'A', deleted: 'D', renamed: 'R', modified: 'M' };

export interface ChangesTreeDeps {
  readonly client: ApiClient;
  readonly locator: WorkspaceLocator;
  readonly active: ActiveWorkspaceSource;
}

export interface ChangeEntry {
  readonly type: 'change';
  readonly file: DiffFile;
  readonly kind: ChangeKind;
  readonly context: DiffContext;
}

interface MessageNode {
  readonly type: 'message';
  readonly text: string;
}

type ChangesNode = ChangeEntry | MessageNode;

interface LoadedDiff {
  readonly context: DiffContext;
  readonly files: readonly DiffFile[];
}

export class ChangesTreeProvider implements vscode.TreeDataProvider<ChangesNode>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly trackerListener: vscode.Disposable;
  private nodes: ChangesNode[] = [];
  private loaded: LoadedDiff | undefined;
  private mode: DiffMode = 'branch';
  private loadSequence = 0;

  readonly onDidChangeTreeData: vscode.Event<void> = this.changeEmitter.event;

  constructor(
    private readonly client: ApiClient,
    private readonly locator: WorkspaceLocator,
    private readonly tracker: ActiveStateTracker,
  ) {
    this.trackerListener = tracker.onDidChange(() => void this.reload());
  }

  get currentMode(): DiffMode {
    return this.mode;
  }

  get currentDiff(): LoadedDiff | undefined {
    return this.loaded;
  }

  get summary(): string {
    if (this.mode === 'uncommitted') {
      return 'uncommitted';
    }
    return this.loaded ? `branch vs ${this.loaded.context.baseRef}` : 'branch';
  }

  getTreeItem(node: ChangesNode): vscode.TreeItem {
    return node.type === 'change' ? this.changeItem(node) : new vscode.TreeItem(node.text);
  }

  getChildren(node?: ChangesNode): ChangesNode[] {
    return node === undefined ? this.nodes : [];
  }

  async toggleMode(): Promise<void> {
    this.mode = this.mode === 'branch' ? 'uncommitted' : 'branch';
    await this.reload();
  }

  async reload(): Promise<void> {
    const sequence = ++this.loadSequence;
    const snapshot = this.tracker.snapshot;
    const loaded = snapshot === undefined ? undefined : await this.tryLoad(snapshot);
    if (sequence !== this.loadSequence) {
      return;
    }
    this.loaded = loaded instanceof ApiError ? undefined : loaded;
    this.nodes = toNodes(loaded);
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.trackerListener.dispose();
    this.changeEmitter.dispose();
  }

  private async tryLoad(snapshot: WorkspaceSnapshot): Promise<LoadedDiff | ApiError> {
    try {
      const response = await this.client.getDiff(snapshot.workspace, { mode: this.mode });
      const baseRef = resolveBaseRef(this.mode, response, snapshot.state);
      return { context: { ...snapshot, baseRef }, files: response.files };
    } catch (error) {
      if (error instanceof ApiError) {
        return error.code === REPO_REQUIRED_CODE ? new ApiError(error.status, error.code, MULTI_REPO_MESSAGE) : error;
      }
      throw error;
    }
  }

  private changeItem(entry: ChangeEntry): vscode.TreeItem {
    const item = new vscode.TreeItem(path.posix.basename(entry.file.path));
    item.resourceUri = workspaceSideUri(this.locator, entry.context, entry.file);
    item.description = describeChange(entry);
    item.tooltip = entry.file.old_path ? `${entry.file.old_path} → ${entry.file.path}` : entry.file.path;
    item.contextValue = CHANGE_ITEM_CONTEXT;
    item.command = { command: OPEN_FILE_DIFF_COMMAND, title: 'Open Diff', arguments: [entry] };
    return item;
  }
}

export function registerChangesTree(context: vscode.ExtensionContext, deps: ChangesTreeDeps): ChangesTreeProvider {
  const tracker = new ActiveStateTracker(deps.active);
  const provider = new ChangesTreeProvider(deps.client, deps.locator, tracker);
  const treeView = vscode.window.createTreeView(CHANGES_VIEW_ID, { treeDataProvider: provider });
  context.subscriptions.push(
    tracker,
    provider,
    treeView,
    registerEmptyDocumentProvider(),
    provider.onDidChangeTreeData(() => (treeView.description = provider.summary)),
    ...registerChangesCommands(deps.locator, provider, treeView),
  );
  return provider;
}

function registerChangesCommands(
  locator: WorkspaceLocator,
  provider: ChangesTreeProvider,
  treeView: vscode.TreeView<ChangesNode>,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(OPEN_FILE_DIFF_COMMAND, (entry?: ChangeEntry) =>
      runWithErrorMessage(() => openSelectedDiff(locator, entry ?? selectedEntry(treeView))),
    ),
    vscode.commands.registerCommand(OPEN_CHANGES_COMMAND, () =>
      runWithErrorMessage(() => openLoadedChanges(locator, provider)),
    ),
    vscode.commands.registerCommand(TOGGLE_CHANGES_MODE_COMMAND, () => provider.toggleMode()),
    vscode.commands.registerCommand(REFRESH_CHANGES_COMMAND, () => provider.reload()),
  ];
}

async function openSelectedDiff(locator: WorkspaceLocator, entry: ChangeEntry | undefined): Promise<void> {
  if (entry === undefined) {
    void vscode.window.showInformationMessage('Select a changed file in the Changes view first.');
    return;
  }
  await openFileDiff(locator, entry.context, entry.file);
}

async function openLoadedChanges(locator: WorkspaceLocator, provider: ChangesTreeProvider): Promise<void> {
  const diff = provider.currentDiff;
  if (diff === undefined) {
    void vscode.window.showInformationMessage('Select a workspace to see its changes.');
    return;
  }
  await openAllChanges(locator, diff.context, diff.files);
}

function selectedEntry(treeView: vscode.TreeView<ChangesNode>): ChangeEntry | undefined {
  return treeView.selection.find((node): node is ChangeEntry => node.type === 'change');
}

function toNodes(loaded: LoadedDiff | ApiError | undefined): ChangesNode[] {
  if (loaded === undefined) {
    return [];
  }
  if (loaded instanceof ApiError) {
    return [{ type: 'message', text: `Cannot load changes: ${loaded.message}` }];
  }
  if (loaded.files.length === 0) {
    return [{ type: 'message', text: `No changes against ${loaded.context.baseRef}` }];
  }
  return loaded.files.map((file) => ({ type: 'change', file, kind: changeKindOf(file), context: loaded.context }));
}

function describeChange(entry: ChangeEntry): string {
  const directory = path.posix.dirname(entry.file.path);
  const location = directory === '.' ? '' : `${directory} `;
  return `${STATUS_LETTERS[entry.kind]} ${location}+${entry.file.additions} −${entry.file.deletions}`;
}
