import { describe, expect, it } from 'vitest';
import type { ProjectRepo, RepoCandidate } from '../../../webview-ui/src/api/git';
import { baseSyncNotice, buildConvertRows, selectionFrom, shortenUrl } from '../../../webview-ui/src/tabs/settings/sections/gitParts/gitLogic';

const CANDIDATES: RepoCandidate[] = [
  { rel_path: 'api', name: 'api', current_branch: 'main' },
  { rel_path: 'web', name: 'web', current_branch: null },
];

const REGISTRY: ProjectRepo[] = [
  { id: 1, rel_path: 'api', name: 'api', base_branch: 'develop', enabled: true },
  { id: 2, rel_path: 'old', name: 'old', base_branch: null, enabled: false },
];

describe('buildConvertRows', () => {
  it('checks every candidate when converting and uses its current branch', () => {
    const rows = buildConvertRows(CANDIDATES, [], 'convert');
    expect(rows.map((row) => row.checked)).toEqual([true, true]);
    expect(rows.map((row) => row.baseBranch)).toEqual(['main', '']);
  });

  it('reflects the registry when editing and keeps repos that vanished from disk', () => {
    const rows = buildConvertRows(CANDIDATES, REGISTRY, 'edit');
    expect(rows.map((row) => [row.relPath, row.checked, row.baseBranch])).toEqual([
      ['api', true, 'develop'],
      ['web', false, ''],
      ['old', false, ''],
    ]);
  });
});

describe('selectionFrom', () => {
  it('keeps checked rows and defaults a blank base branch', () => {
    const rows = [
      { relPath: 'api', name: 'api', checked: true, baseBranch: ' main ' },
      { relPath: 'web', name: 'web', checked: true, baseBranch: '' },
      { relPath: 'x', name: 'x', checked: false, baseBranch: 'y' },
    ];
    expect(selectionFrom(rows)).toEqual([
      { rel_path: 'api', base_branch: 'main' },
      { rel_path: 'web', base_branch: 'develop' },
    ]);
  });
});

describe('shortenUrl', () => {
  it('strips the scheme and truncates long urls', () => {
    expect(shortenUrl('https://host/pr/1')).toBe('host/pr/1');
    const shortened = shortenUrl(`https://host/${'a'.repeat(80)}`);
    expect(shortened).toHaveLength(58);
    expect(shortened.endsWith('…')).toBe(true);
  });
});

describe('baseSyncNotice', () => {
  it('reports updates and non-trivial failures only', () => {
    expect(baseSyncNotice({ updated: true, branch: 'develop' }, 'x')).toEqual({ kind: 'updated', branch: 'develop' });
    expect(baseSyncNotice({ updated: false, reason: 'diverged' }, 'x')).toEqual({ kind: 'notUpdated', branch: 'x', reason: 'diverged' });
    expect(baseSyncNotice({ updated: false, reason: 'no-local-branch' }, 'x')).toBeUndefined();
    expect(baseSyncNotice(null, 'x')).toBeUndefined();
  });
});
