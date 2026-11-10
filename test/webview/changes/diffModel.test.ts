import type { DiffFile, ReviewComment } from '@api-types';
import { describe, expect, it } from 'vitest';
import {
  ALL_REPOS,
  baseOptions,
  blockersInRepo,
  buildFileTree,
  CHANGE_LETTERS,
  changeKindOf,
  changesCountLabel,
  defaultBaseName,
  fileLabel,
  filesCountLabel,
  filterFiles,
  flattenTree,
  nativeRepo,
  repoChips,
  resolveRepo,
  selectableBases,
  toDiffFileRef,
  uncommittedInBranch,
} from '../../../webview-ui/src/tabs/changes/diffModel';

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
    expect(resolveRepo(['.', 'api'], 'gone')).toBe(ALL_REPOS);
    expect(resolveRepo(['api'], 'gone')).toBe('api');
    expect(resolveRepo([], 'gone')).toBe('');
  });

  it('omits the root repo for native calls', () => {
    expect(nativeRepo('.')).toBeUndefined();
    expect(nativeRepo('')).toBeUndefined();
    expect(nativeRepo('api')).toBe('api');
  });
});

describe('filesCountLabel', () => {
  const t = (key: string, params?: Readonly<Record<string, string | number>>): string => (params === undefined ? key : `${key} ${JSON.stringify(params)}`);

  it('filesCountLabel_shouldShowShownOfTotal_whenFilterIsActive', () => {
    expect(filesCountLabel(t, 3, 12, true)).toBe('vsc.changes.filteredCount {"shown":3,"total":12}');
  });

  it('filesCountLabel_shouldUseSingular_whenOneFileChanged', () => {
    expect(filesCountLabel(t, 1, 1, false)).toBe('vsc.changes.fileChangedOne');
  });

  it('filesCountLabel_shouldUseTotal_whenNotFiltered', () => {
    expect(filesCountLabel(t, 12, 12, false)).toBe('badges.filesChanged {"count":12}');
  });
});

describe('CHANGE_LETTERS', () => {
  it('maps change kinds to the SCM status letters', () => {
    expect(CHANGE_LETTERS).toEqual({ added: 'A', modified: 'M', deleted: 'D', renamed: 'R' });
  });
});

describe('multi-repo selection', () => {
  const t = (key: string, params?: Readonly<Record<string, string | number>>): string => (params === undefined ? key : `${key} ${JSON.stringify(params)}`);
  const repos = [{ path: 'qa-api', name: 'qa-api' }, { path: 'qa-notifier', name: 'qa-notifier' }];
  const blockers = [
    { id: 1, target: 'qa-api/app/a.py' },
    { id: 2, target: 'qa-api/app' },
    { id: 3, target: 'qa-notifier/send.py' },
  ] as ReviewComment[];

  it('resolveRepo_shouldKeepAllRepos_whenWorkspaceHasSeveralRepos', () => {
    expect(resolveRepo(['qa-api', 'qa-notifier'], ALL_REPOS)).toBe(ALL_REPOS);
  });

  it('resolveRepo_shouldFallBackToFirstRepo_whenAllReposIsSavedForSingleRepo', () => {
    expect(resolveRepo(['qa-api'], ALL_REPOS)).toBe('qa-api');
  });

  it('blockersInRepo_shouldKeepOnlyThreadsUnderTheRepoDirectory', () => {
    expect(blockersInRepo(blockers, 'qa-api').map((comment) => comment.id)).toEqual([1, 2]);
    expect(blockersInRepo(blockers, 'qa-notifier').map((comment) => comment.id)).toEqual([3]);
  });

  it('blockersInRepo_shouldNotMatchRepoWithSharedNamePrefix', () => {
    expect(blockersInRepo([{ id: 4, target: 'qa-api-v2/x.py' } as ReviewComment], 'qa-api')).toEqual([]);
  });

  it('blockersInRepo_shouldKeepEverything_forAllRepos', () => {
    expect(blockersInRepo(blockers, ALL_REPOS)).toHaveLength(3);
  });

  it('resolveRepo_shouldDefaultToAllRepos_whenNothingIsSavedForSeveralRepos', () => {
    expect(resolveRepo(['qa-api', 'qa-notifier'], '')).toBe(ALL_REPOS);
  });

  it('resolveRepo_shouldKeepSavedRepo_whenItStillExists', () => {
    expect(resolveRepo(['qa-api', 'qa-notifier'], 'qa-notifier')).toBe('qa-notifier');
  });

  it('resolveRepo_shouldFallBackToAllRepos_whenSavedRepoIsGone', () => {
    expect(resolveRepo(['qa-api', 'qa-notifier'], 'removed')).toBe(ALL_REPOS);
  });

  it('repoChips_shouldShowThreadCountsWithoutFileCounts_whenRepoDiffsAreLoading', () => {
    expect(repoChips('All', repos, undefined, blockers)).toEqual([
      { value: ALL_REPOS, name: 'All', fileCount: undefined, threadCount: 3 },
      { value: 'qa-api', name: 'qa-api', fileCount: undefined, threadCount: 2 },
      { value: 'qa-notifier', name: 'qa-notifier', fileCount: undefined, threadCount: 1 },
    ]);
  });

  it('repoChips_shouldShowPerRepoFileAndThreadCounts_whenRepoDiffsLoaded', () => {
    const repoDiffs = [{ ...repos[0], files: [file('a'), file('b')] }, { ...repos[1], files: [file('c')] }];

    expect(repoChips('All', repos, repoDiffs, blockers)).toEqual([
      { value: ALL_REPOS, name: 'All', fileCount: 3, threadCount: 3 },
      { value: 'qa-api', name: 'qa-api', fileCount: 2, threadCount: 2 },
      { value: 'qa-notifier', name: 'qa-notifier', fileCount: 1, threadCount: 1 },
    ]);
  });
});

describe('changes count label', () => {
  const t = (key: string, params?: Readonly<Record<string, string | number>>): string => (params === undefined ? key : `${key} ${JSON.stringify(params)}`);

  it('changesCountLabel_shouldSplitCommittedAndUncommitted_whenBranchHoldsUncommittedFiles', () => {
    expect(changesCountLabel(t, { mode: 'branch', shown: 14, total: 14, uncommittedInBranch: 2 })).toBe('vsc.changes.count.split {"committed":12,"uncommitted":2}');
  });

  it('changesCountLabel_shouldNameTheMode_whenBranchHasNoUncommittedFiles', () => {
    expect(changesCountLabel(t, { mode: 'branch', shown: 12, total: 12, uncommittedInBranch: 0 })).toBe('vsc.changes.count.mode {"mode":"vsc.changes.source.branch","count":12}');
  });

  it('changesCountLabel_shouldNameUncommittedMode_whenCountingWorkingTreeOnly', () => {
    expect(changesCountLabel(t, { mode: 'uncommitted', shown: 2, total: 2, uncommittedInBranch: 0 })).toBe('vsc.changes.count.mode {"mode":"vsc.changes.source.uncommitted","count":2}');
  });

  it('changesCountLabel_shouldShowShownOfTotalWithMode_whenFilterHidesFiles', () => {
    expect(changesCountLabel(t, { mode: 'commit', shown: 1, total: 5, uncommittedInBranch: 0 })).toBe('vsc.changes.count.filtered {"mode":"diff.commit","shown":1,"total":5}');
  });

  it('uncommittedInBranch_shouldCountBranchFilesThatAreAlsoUncommitted_underTheRepoPrefix', () => {
    const uncommitted = new Set(['qa-api/app/a.py', 'qa-api/app/new.py', 'other/app/b.py']);

    expect(uncommittedInBranch([file('app/a.py'), file('app/b.py'), file('app/new.py')], uncommitted, 'qa-api')).toBe(2);
  });
});

describe('base selector', () => {
  const t = (key: string, params?: Readonly<Record<string, string | number>>): string => (params === undefined ? key : `${key} ${JSON.stringify(params)}`);
  const branches = [
    { name: 'feature/x', ref: 'feature/x', current: true },
    { name: 'main', ref: 'origin/main', current: false },
    { name: 'develop', ref: 'develop', current: false },
  ];

  it('selectableBases_shouldDropCurrentBranchAndSourceBranch', () => {
    expect(selectableBases(branches, 'main')).toEqual(['develop']);
  });

  it('selectableBases_shouldKeepEveryOtherBranch_whenSourceBranchIsUnknown', () => {
    expect(selectableBases(branches, null)).toEqual(['main', 'develop']);
  });

  it('baseOptions_shouldLabelTheDefaultWithItsResolvedName_andNotRepeatIt', () => {
    expect(baseOptions(t, ['main', 'develop'], 'main')).toEqual([
      { value: '', label: 'vsc.changes.baseDefaultNamed {"base":"main"}' },
      { value: 'develop', label: 'develop' },
    ]);
  });

  it('baseOptions_shouldUseGenericDefaultLabel_whenDefaultNameIsUnknown', () => {
    expect(baseOptions(t, ['develop'], undefined)[0]).toEqual({ value: '', label: 'diff.baseDefault' });
  });

  it('defaultBaseName_shouldPreferTheServerResolvedBase_whenNoBaseIsSelected', () => {
    expect(defaultBaseName('', 'master', 'main')).toBe('master');
  });

  it('defaultBaseName_shouldUseWorkspaceSourceBranch_whenAnotherBaseIsSelected', () => {
    expect(defaultBaseName('develop', 'develop', 'main')).toBe('main');
    expect(defaultBaseName('develop', 'develop', null)).toBeUndefined();
  });
});

describe('flattenTree subtree paths', () => {
  it('flattenTree_shouldListEveryNestedPath_forFolderRollups', () => {
    const rows = flattenTree(buildFileTree([file('app/a.py'), file('app/sub/b.py'), file('app/sub/c.py'), file('readme.md')]), new Set(['app']));

    expect(rows[0]).toMatchObject({ type: 'dir', path: 'app', isCollapsed: true, subtreePaths: ['app', 'app/sub', 'app/sub/b.py', 'app/sub/c.py', 'app/a.py'] });
  });
});
