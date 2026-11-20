import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client';
import type { DiffFile, DiffQuery, DiffRepo, WorkspaceRef, WorkspaceState } from '../src/api/types';
import { ChangeDecorationProvider, changeResourceUri } from '../src/diff/changeDecorations';
import type { ChangeFileNode, ChangeRepoNode } from '../src/diff/changesModel';
import {
  ChangesTreeProvider,
  changeTreeItem,
  openAllLoadedChanges,
  openChangeDiff,
  type ChangesTreeNode,
  type ChangesWorkspaceSource,
} from '../src/diff/changesTree';
import { ChangesViewMemory } from '../src/diff/changesViewMemory';
import type { WorkspaceLocator } from '../src/fs/workspaceLocator';
import { commands, EventEmitter, Uri, ViewColumn, window } from './vscodeStub';

const WORKSPACE: WorkspaceRef = { projectId: 'shop', branch: 'feature/a' };
const STATE = { branch: 'feature/a', source_branch: 'main', working_dir: '/wt' } as WorkspaceState;

function file(path: string, overrides: Partial<DiffFile> = {}): DiffFile {
  return { path, old_path: null, similarity: null, additions: 2, deletions: 1, diff: '', ...overrides };
}

class FakeMemento {
  readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

class FakeActiveWorkspace implements ChangesWorkspaceSource {
  readonly switchEmitter = new EventEmitter<unknown>();
  readonly stateEmitter = new EventEmitter<WorkspaceState>();
  readonly onDidChange = this.switchEmitter.event;
  readonly onDidChangeState = this.stateEmitter.event;
  ref: WorkspaceRef | undefined = WORKSPACE;
  state: WorkspaceState | undefined = STATE;
}

const locator = { fileUri: (_workspace: WorkspaceRef, _state: WorkspaceState, relPath: string) => Uri.file(`/wt/${relPath}`), isLocal: () => true };

function setup(
  repos: DiffRepo[] = [{ path: '.', name: 'shop' }],
  filesByRepo: Record<string, DiffFile[]> = { '.': [file('src/a.ts')] },
  memento = new FakeMemento(),
) {
  const baseOf = (query: DiffQuery) => query.base ?? repos.find((entry) => entry.path === query.repo)?.base_branch ?? 'main';
  const client = {
    listRepos: vi.fn(async () => repos),
    getDiff: vi.fn(async (_workspace: WorkspaceRef, query: DiffQuery) => ({ mode: query.mode, base: baseOf(query), files: filesByRepo[query.repo ?? '.'] ?? [] })),
  };
  const active = new FakeActiveWorkspace();
  const provider = new ChangesTreeProvider(client as unknown as ApiClient, active, new ChangesViewMemory(memento as never));
  const deps = { locator: locator as unknown as WorkspaceLocator, active, provider };
  return { client, memento, active, provider, deps };
}

async function loadedFiles(provider: ChangesTreeProvider): Promise<ChangeFileNode[]> {
  await provider.reload();
  const collect = (nodes: readonly ChangesTreeNode[]): ChangeFileNode[] =>
    nodes.flatMap((node) => (node.type === 'file' ? [node] : collect(provider.getChildren(node))));
  return collect(provider.getChildren());
}

beforeEach(() => {
  commands.executeCommand.mockReset();
  commands.getCommands.mockResolvedValue(['vscode.changes']);
});

describe('ChangesTreeProvider', () => {
  it('provider_shouldDefaultToBranchModeAndTreeLayout_whenNothingIsStored', () => {
    const { provider } = setup();

    expect(provider.mode).toBe('branch');
    expect(provider.layout).toBe('tree');
  });

  it('setMode_shouldPersistModeAndReloadUncommittedChanges_whenViewIsVisible', async () => {
    const { client, memento, provider } = setup();
    provider.setVisible(true);

    await provider.setMode('uncommitted');
    await vi.waitFor(() => expect(client.getDiff).toHaveBeenLastCalledWith(WORKSPACE, { mode: 'uncommitted', repo: '.' }));

    expect(memento.values.get('governedWorkflow.changes.mode')).toBe('uncommitted');
    expect(setup().provider.mode).toBe('branch');
  });

  it('setLayout_shouldPersistLayoutAndRebuildWithoutFetching_whenCalled', async () => {
    const { client, memento, provider } = setup();
    await provider.reload();

    await provider.setLayout('list');

    expect(memento.values.get('governedWorkflow.changes.layout')).toBe('list');
    expect(provider.getChildren().map((node) => node.type)).toEqual(['file']);
    expect(client.listRepos).toHaveBeenCalledTimes(1);
  });

  it('invalidate_shouldNotFetch_whenViewIsHidden', () => {
    const { client, active, provider } = setup();

    active.stateEmitter.fire(STATE);
    active.switchEmitter.fire(WORKSPACE);

    expect(client.listRepos).not.toHaveBeenCalled();
  });

  it('setVisible_shouldLoadOnce_whenViewBecomesVisibleWhileStale', async () => {
    const { client, provider } = setup();

    provider.setVisible(true);
    await vi.waitFor(() => expect(provider.fileCount).toBe(1));
    provider.setVisible(false);
    provider.setVisible(true);

    expect(client.listRepos).toHaveBeenCalledTimes(1);
  });

  it('stateChange_shouldReload_whenViewIsVisible', async () => {
    const { client, active, provider } = setup();
    provider.setVisible(true);
    await vi.waitFor(() => expect(client.listRepos).toHaveBeenCalledTimes(1));

    active.stateEmitter.fire(STATE);

    await vi.waitFor(() => expect(client.listRepos).toHaveBeenCalledTimes(2));
  });

  it('workspaceSwitch_shouldClearLoadedChanges_whenViewIsHidden', async () => {
    const { active, provider } = setup();
    await provider.reload();

    active.switchEmitter.fire(undefined);

    expect(provider.getChildren()).toEqual([]);
    expect(provider.isLoaded).toBe(false);
    expect(provider.fileCount).toBe(0);
  });

  it('reload_shouldGroupByRepoAndSummariseBase_whenWorkspaceHasSeveralRepos', async () => {
    const { provider } = setup([{ path: 'api', name: 'API' }, { path: 'web', name: 'Web' }], { api: [file('a.ts')], web: [file('b.ts'), file('c.ts')] });

    await provider.reload();

    expect(provider.getChildren().map((node) => node.id)).toEqual(['repo:api', 'repo:web']);
    expect(provider.fileCount).toBe(3);
    expect(provider.summary).toBe('vs main');
  });

  it('reload_shouldShowTheErrorAsAMessage_whenTheApiFails', async () => {
    const { client, provider } = setup();
    const { ApiError } = await import('../src/api/errors');
    client.listRepos.mockRejectedValueOnce(new ApiError(500, 'boom', 'server exploded'));

    await provider.reload();

    expect(provider.getChildren()).toEqual([{ type: 'message', id: 'message', text: 'Cannot load changes: server exploded' }]);
  });
});

const TWO_REPOS: DiffRepo[] = [
  { path: 'api', name: 'API', base_branch: 'develop' },
  { path: 'web', name: 'Web', base_branch: 'main' },
];
const TWO_REPO_FILES = { api: [file('a.ts')], web: [file('b.ts')] };

function repoNodes(provider: ChangesTreeProvider): ChangeRepoNode[] {
  return provider.getChildren().filter((node): node is ChangeRepoNode => node.type === 'repo');
}

describe('per-repo base', () => {
  it('reload_shouldDescribeEachRepoAgainstItsOwnDefaultBase_whenNoBaseIsChanged', async () => {
    const { client, provider } = setup(TWO_REPOS, TWO_REPO_FILES);

    await provider.reload();

    expect(client.getDiff).toHaveBeenCalledWith(WORKSPACE, { mode: 'branch', repo: 'web', base: undefined });
    expect(repoNodes(provider).map((node) => changeTreeItem(node).description)).toEqual(['vs develop', 'vs main']);
    expect(repoNodes(provider).map((node) => changeTreeItem(node).contextValue)).toEqual(['gwChangeRepo', 'gwChangeRepo']);
    expect(provider.summary).toBe('vs develop, main');
  });

  it('setBaseOverride_shouldPersistPerWorkspaceAndRepoAndMarkTheNode_whenAnotherBaseIsChosen', async () => {
    const memento = new FakeMemento();
    const { client, provider } = setup(TWO_REPOS, TWO_REPO_FILES, memento);
    await provider.reload();

    await provider.setBaseOverride(repoNodes(provider)[1].repo, 'release/1.0');

    expect(client.getDiff).toHaveBeenLastCalledWith(WORKSPACE, { mode: 'branch', repo: 'web', base: 'release/1.0' });
    const item = changeTreeItem(repoNodes(provider)[1]);
    expect(item.description).toBe('vs release/1.0 (changed)');
    expect(item.contextValue).toBe('gwChangeRepoOverridden');
    expect(item.tooltip).toBe('web • base changed to release/1.0; default base is main');
    const reopened = setup(TWO_REPOS, TWO_REPO_FILES, memento);
    await reopened.provider.reload();
    expect(repoNodes(reopened.provider).map((node) => node.repo.source.base)).toEqual(['develop', 'release/1.0']);
  });

  it('setBaseOverride_shouldNotApplyTheOverride_whenAnotherWorkspaceIsActive', async () => {
    const memento = new FakeMemento();
    const first = setup(TWO_REPOS, TWO_REPO_FILES, memento);
    await first.provider.reload();
    await first.provider.setBaseOverride(repoNodes(first.provider)[0].repo, 'main');

    const other = setup(TWO_REPOS, TWO_REPO_FILES, memento);
    other.active.ref = { projectId: 'shop', branch: 'feature/b' };
    await other.provider.reload();

    expect(repoNodes(other.provider).map((node) => node.repo.baseOverride)).toEqual([undefined, undefined]);
  });

  it('setBaseOverride_shouldClearTheOverride_whenTheDefaultBaseIsChosen', async () => {
    const memento = new FakeMemento();
    const { provider } = setup(TWO_REPOS, TWO_REPO_FILES, memento);
    await provider.reload();
    await provider.setBaseOverride(repoNodes(provider)[0].repo, 'main');

    await provider.setBaseOverride(repoNodes(provider)[0].repo, undefined);

    expect(memento.values.get('governedWorkflow.changes.baseOverrides')).toEqual({});
    expect(changeTreeItem(repoNodes(provider)[0]).description).toBe('vs develop');
  });

  it('reload_shouldDropTheOverrideAndWarn_whenTheChosenBaseNoLongerExists', async () => {
    const memento = new FakeMemento();
    const { client, provider } = setup(TWO_REPOS, TWO_REPO_FILES, memento);
    await provider.reload();
    const { ApiError } = await import('../src/api/errors');
    client.getDiff.mockRejectedValueOnce(new ApiError(400, 'base_ref_not_found', 'base_ref_not_found'));

    await provider.setBaseOverride(repoNodes(provider)[0].repo, 'gone');

    expect(window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Base "gone" was not found in API'));
    expect(memento.values.get('governedWorkflow.changes.baseOverrides')).toEqual({});
    expect(changeTreeItem(repoNodes(provider)[0]).description).toBe('vs develop');
  });

  it('setRepoFilter_shouldShowOnlyTheChosenRepoAndRemainForTheWorkspace', async () => {
    const memento = new FakeMemento();
    const { provider } = setup(TWO_REPOS, TWO_REPO_FILES, memento);
    await provider.reload();

    await provider.setRepoFilter('web');

    expect(provider.getChildren().map((node) => node.id)).toEqual(['file:web:b.ts']);
    expect(provider.summary).toBe('Web vs main');
    expect(provider.fileCount).toBe(1);
    expect(provider.changeGroups.map((group) => group.source.repo)).toEqual(['web']);
    const reopened = setup(TWO_REPOS, TWO_REPO_FILES, memento);
    await reopened.provider.reload();
    expect(reopened.provider.repoFilter).toBe('web');
  });
});

describe('changes view items', () => {
  it('changeTreeItem_shouldDecorateFileAndOpenItsDiff_whenNodeIsAFile', async () => {
    const { provider } = setup(undefined, { '.': [file('src/a.ts', { status: 'deleted' })] });
    const [node] = await loadedFiles(provider);

    const item = changeTreeItem(node);

    expect(item.id).toBe('file:.:src/a.ts');
    expect(item.description).toBe('+2 −1');
    expect(item.contextValue).toBe('gwChangeFileDeleted');
    expect(item.command).toMatchObject({ command: 'governedWorkflow.openFileDiff', arguments: [node] });
    expect(new ChangeDecorationProvider().provideFileDecoration(item.resourceUri as never)).toMatchObject({ badge: 'D' });
  });

  it('provideFileDecoration_shouldIgnoreOtherSchemesAndFolders', () => {
    const decorations = new ChangeDecorationProvider();

    expect(decorations.provideFileDecoration(Uri.file('/wt/a.ts') as never)).toBeUndefined();
    expect(decorations.provideFileDecoration(changeResourceUri('src') as never)).toBeUndefined();
  });
});

describe('opening changes', () => {
  it('openChangeDiff_shouldOpenInTheActiveGroupAsPreview_whenFileIsClicked', async () => {
    const { provider, deps } = setup();
    const [node] = await loadedFiles(provider);

    await openChangeDiff(deps, node);

    const [command, left, right, title, options] = commands.executeCommand.mock.calls[0];
    expect(command).toBe('vscode.diff');
    expect(left).toMatchObject({ scheme: 'gw-base', path: '/feature%2Fa/src/a.ts', query: 'ref=main' });
    expect(right).toMatchObject({ scheme: 'file', path: '/wt/src/a.ts' });
    expect(title).toBe('src/a.ts (main ↔ workspace)');
    expect(options).toEqual({ viewColumn: ViewColumn.Active, preview: true, preserveFocus: false });
  });

  it('openChangeDiff_shouldUseAnEmptyLeftSideAndTheInnerRepoPath_whenFileWasAddedInAnInnerRepo', async () => {
    const { provider, deps } = setup([{ path: 'api', name: 'API' }, { path: 'web', name: 'Web' }], { api: [file('a.ts', { status: 'new' })] });
    const [node] = await loadedFiles(provider);

    await openChangeDiff(deps, node);

    const [, left, right] = commands.executeCommand.mock.calls[0];
    expect(left).toMatchObject({ scheme: 'gw-empty', path: '/a.ts' });
    expect(right).toMatchObject({ scheme: 'file', path: '/wt/api/a.ts' });
  });

  it('openAllLoadedChanges_shouldPassResourceOriginalModifiedTuplesAcrossRepos', async () => {
    const files = { api: [file('a.ts')], web: [file('b.ts', { status: 'deleted' })] };
    const { provider, deps } = setup([{ path: 'api', name: 'API' }, { path: 'web', name: 'Web' }], files);
    await provider.reload();

    await openAllLoadedChanges(deps);

    const [command, title, resources] = commands.executeCommand.mock.calls[0];
    expect(command).toBe('vscode.changes');
    expect(title).toBe('feature/a (main ↔ workspace)');
    expect(resources).toEqual([
      [Uri.file('/wt/api/a.ts'), expect.objectContaining({ scheme: 'gw-base', query: 'ref=main&repo=api' }), Uri.file('/wt/api/a.ts')],
      [Uri.file('/wt/web/b.ts'), expect.objectContaining({ scheme: 'gw-base', query: 'ref=main&repo=web' }), expect.objectContaining({ scheme: 'gw-empty' })],
    ]);
  });
});
