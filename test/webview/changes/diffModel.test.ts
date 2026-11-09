import type { DiffFile } from '@api-types';
import { describe, expect, it } from 'vitest';
import { buildFileTree, changeKindOf, fileLabel, filterFiles, flattenTree, nativeRepo, resolveRepo, toDiffFileRef } from '../../../webview-ui/src/tabs/changes/diffModel';

function file(path: string, overrides: Partial<DiffFile> = {}): DiffFile {
  return { path, old_path: null, similarity: null, additions: 1, deletions: 2, diff: '', ...overrides };
}

describe('changeKindOf', () => {
  it('detects added files from status or dev-null marker', () => {
    expect(changeKindOf(file('a', { status: 'new' }))).toBe('added');
    expect(changeKindOf(file('a', { diff: '--- /dev/null\n+++ b/a' }))).toBe('added');
  });

  it('detects deleted, renamed and modified files', () => {
    expect(changeKindOf(file('a', { diff: '--- a/a\n+++ /dev/null' }))).toBe('deleted');
    expect(changeKindOf(file('b', { old_path: 'a' }))).toBe('renamed');
    expect(changeKindOf(file('a'))).toBe('modified');
  });
});

describe('toDiffFileRef', () => {
  it('maps a diff file to the native reference', () => {
    expect(toDiffFileRef(file('b', { old_path: 'a' }))).toEqual({ path: 'b', oldPath: 'a', kind: 'renamed' });
  });
});

describe('filterFiles', () => {
  const files = [file('src/Alpha.ts'), file('docs/beta.md')];

  it('matches the file name case-insensitively, not the directory', () => {
    expect(filterFiles(files, 'ALPHA').map((f) => f.path)).toEqual(['src/Alpha.ts']);
    expect(filterFiles(files, 'docs')).toEqual([]);
  });

  it('returns everything for a blank query', () => {
    expect(filterFiles(files, '  ')).toHaveLength(2);
  });
});

describe('fileLabel', () => {
  it('shows the previous name for renames', () => {
    expect(fileLabel(file('x/new.ts', { old_path: 'y/old.ts' }))).toBe('new.ts ← old.ts');
    expect(fileLabel(file('x/same.ts'))).toBe('same.ts');
  });
});

describe('buildFileTree and flattenTree', () => {
  const files = [file('src/a/one.ts'), file('src/a/two.ts'), file('src/b/deep/three.ts'), file('readme.md')];

  it('puts directories first and compacts single-child chains', () => {
    const tree = buildFileTree(files);
    expect(tree.map((node) => node.name)).toEqual(['src', 'readme.md']);
    const src = tree[0];
    expect(src?.type === 'dir' && src.children.map((child) => child.name)).toEqual(['a', 'b/deep']);
  });

  it('gives compacted directories the full path of the deepest directory', () => {
    const rows = flattenTree(buildFileTree(files), new Set());
    const compacted = rows.find((row) => row.type === 'dir' && row.name === 'b/deep');
    expect(compacted?.type === 'dir' && compacted.path).toBe('src/b/deep');
  });

  it('hides children of collapsed directories', () => {
    const rows = flattenTree(buildFileTree(files), new Set(['src/a']));
    const names = rows.map((row) => row.name);
    expect(names).toContain('a');
    expect(names).not.toContain('one.ts');
    expect(names).toContain('three.ts');
  });

  it('records the nesting depth of rows', () => {
    const rows = flattenTree(buildFileTree(files), new Set());
    const one = rows.find((row) => row.type === 'file' && row.name === 'one.ts');
    expect(one?.depth).toBe(2);
  });
});

describe('repo helpers', () => {
  it('keeps the saved repo only when it still exists', () => {
    expect(resolveRepo(['.', 'api'], 'api')).toBe('api');
    expect(resolveRepo(['.', 'api'], 'gone')).toBe('.');
    expect(resolveRepo([], 'gone')).toBe('');
  });

  it('omits the root repo for native calls', () => {
    expect(nativeRepo('.')).toBeUndefined();
    expect(nativeRepo('')).toBeUndefined();
    expect(nativeRepo('api')).toBe('api');
  });
});
