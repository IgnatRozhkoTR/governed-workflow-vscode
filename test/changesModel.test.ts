import { describe, expect, it } from 'vitest';
import type { DiffFile } from '../src/api/types';
import { buildChangeNodes, countChangedFiles, type ChangeNode, type RepoChanges } from '../src/diff/changesModel';

function file(path: string, overrides: Partial<DiffFile> = {}): DiffFile {
  return { path, old_path: null, similarity: null, additions: 1, deletions: 0, diff: '', ...overrides };
}

function repo(files: DiffFile[], repoPath?: string): RepoChanges {
  return { repo: repoPath, name: repoPath ?? 'root', source: { mode: 'branch', base: 'main', repo: repoPath }, files };
}

function labelsOf(nodes: readonly ChangeNode[]): string[] {
  return nodes.map((node) => (node.type === 'file' ? node.file.path : node.type === 'folder' ? `${node.label}/` : `[${node.repo.name}]`));
}

function child(nodes: readonly ChangeNode[], index: number): readonly ChangeNode[] {
  const node = nodes[index];
  if (node.type === 'file') {
    throw new Error('file nodes have no children');
  }
  return node.children;
}

describe('buildChangeNodes', () => {
  it('buildChangeNodes_shouldCompactSingleChildFolderChains_whenLayoutIsTree', () => {
    const nodes = buildChangeNodes([repo([file('src/main/java/App.java'), file('src/main/java/Util.java')])], 'tree');

    expect(labelsOf(nodes)).toEqual(['src/main/java/']);
    expect(nodes[0].id).toBe('folder:.:src/main/java');
    expect(labelsOf(child(nodes, 0))).toEqual(['src/main/java/App.java', 'src/main/java/Util.java']);
  });

  it('buildChangeNodes_shouldStopCompactingAtFoldersWithFilesOrBranches_whenLayoutIsTree', () => {
    const nodes = buildChangeNodes([repo([file('src/a/x.ts'), file('src/b/y.ts'), file('src/z.ts'), file('README.md')])], 'tree');

    expect(labelsOf(nodes)).toEqual(['src/', 'README.md']);
    expect(labelsOf(child(nodes, 0))).toEqual(['a/', 'b/', 'src/z.ts']);
    expect(child(nodes, 0).map((node) => node.id)).toEqual(['folder:.:src/a', 'folder:.:src/b', 'file:.:src/z.ts']);
  });

  it('buildChangeNodes_shouldListFilesFlatWithTheirDirectory_whenLayoutIsList', () => {
    const nodes = buildChangeNodes([repo([file('src/b.ts'), file('a.ts')])], 'list');

    expect(labelsOf(nodes)).toEqual(['a.ts', 'src/b.ts']);
    expect(nodes.map((node) => (node.type === 'file' ? node.directory : 'not a file'))).toEqual([undefined, 'src']);
  });

  it('buildChangeNodes_shouldKeepFileIdsStable_whenLayoutChanges', () => {
    const repos = [repo([file('src/a.ts')])];

    const treeFile = child(buildChangeNodes(repos, 'tree'), 0)[0];
    const listFile = buildChangeNodes(repos, 'list')[0];

    expect(treeFile.id).toBe(listFile.id);
  });

  it('buildChangeNodes_shouldGroupByRepoAndSkipUnchangedRepos_whenWorkspaceHasSeveralRepos', () => {
    const nodes = buildChangeNodes([repo([file('a.ts')], 'api'), repo([], 'web'), repo([file('lib/b.ts')], 'core')], 'tree');

    expect(labelsOf(nodes)).toEqual(['[api]', '[core]']);
    expect(nodes.map((node) => node.id)).toEqual(['repo:api', 'repo:core']);
    const coreFolder = child(nodes, 1)[0];
    expect(coreFolder).toMatchObject({ type: 'folder', id: 'folder:core:lib', workspacePath: 'core/lib' });
  });

  it('buildChangeNodes_shouldCarryTheRepoSourceAndJoinedPath_whenFileIsInAnInnerRepo', () => {
    const nodes = buildChangeNodes([repo([file('a.ts', { status: 'new' })], 'api'), repo([], 'web')], 'list');

    expect(child(nodes, 0)[0]).toMatchObject({
      workspacePath: 'api/a.ts',
      kind: 'added',
      source: { mode: 'branch', base: 'main', repo: 'api' },
    });
  });

  it('buildChangeNodes_shouldReturnNothing_whenNoRepoHasChanges', () => {
    expect(buildChangeNodes([repo([], 'api'), repo([], 'web')], 'tree')).toEqual([]);
    expect(buildChangeNodes([repo([])], 'list')).toEqual([]);
  });
});

describe('countChangedFiles', () => {
  it('countChangedFiles_shouldSumFilesAcrossRepos', () => {
    expect(countChangedFiles([repo([file('a'), file('b')], 'api'), repo([file('c')], 'web')])).toBe(3);
  });
});
