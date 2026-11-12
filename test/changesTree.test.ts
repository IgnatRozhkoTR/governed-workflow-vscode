import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client';
import type { DiffFile, DiffQuery, WorkspaceRef, WorkspaceState } from '../src/api/types';
import { ChangeDecorationProvider, changeResourceUri } from '../src/diff/changeDecorations';
import type { ChangeFileNode } from '../src/diff/changesModel';
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
import { commands, EventEmitter, Uri, ViewColumn } from './vscodeStub';

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

function setup(repos: { path: string; name: string }[] = [{ path: '.', name: 'shop' }], filesByRepo: Record<string, DiffFile[]> = { '.': [file('src/a.ts')] }) {
  const client = {
    listRepos: vi.fn(async () => repos),
    getDiff: vi.fn(async (_workspace: WorkspaceRef, query: DiffQuery) => ({ mode: query.mode, base: 'main', files: filesByRepo[query.repo ?? '.'] ?? [] })),
  };
  const memento = new FakeMemento();
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
