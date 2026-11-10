import type { ReviewComment } from '@api-types';
import { describe, expect, it } from 'vitest';
import { groupRoots, groupRootsByRepo, isAddressedNotClosed, severityTone, splitSeverity } from '../../../webview-ui/src/tabs/review/reviewModel';

function root(id: number, overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id, parent_id: null, scope: 'review', target: 'app/a.py', file_path: 'app/a.py', line_start: 1, line_end: 1, line_hash: null,
    text: `issue ${id}`, author: 'reviewer', type: null, created_at: '2026-11-09T10:00:00', resolved: false, resolved_at: null, resolution: 'open', replies: [],
    ...overrides,
  };
}

describe('splitSeverity', () => {
  it('splitSeverity_shouldExtractSeverity_whenTextStartsWithBracketedLevel', () => {
    expect(splitSeverity('[Major]  Race on save')).toEqual({ severity: 'major', text: 'Race on save' });
  });

  it('splitSeverity_shouldKeepText_whenNoSeverityPrefix', () => {
    expect(splitSeverity('Plain [critical] note')).toEqual({ text: 'Plain [critical] note' });
  });

  it('splitSeverity_shouldIgnoreUnknownLevels', () => {
    expect(splitSeverity('[blocker] Stop')).toEqual({ text: '[blocker] Stop' });
  });
});

describe('severityTone', () => {
  it('severityTone_shouldMapCriticalToDangerAndMajorToWarning', () => {
    expect(severityTone('critical')).toBe('danger');
    expect(severityTone('major')).toBe('warning');
    expect(severityTone('minor')).toBe('neutral');
  });
});

describe('isAddressedNotClosed', () => {
  it('isAddressedNotClosed_shouldBeTrue_whenAgentSetResolutionButThreadIsOpen', () => {
    expect(isAddressedNotClosed(root(1, { resolution: 'fixed' }))).toBe(true);
  });

  it('isAddressedNotClosed_shouldBeFalse_whenResolutionIsOpenOrMissing', () => {
    expect(isAddressedNotClosed(root(1))).toBe(false);
    expect(isAddressedNotClosed(root(2, { resolution: null }))).toBe(false);
  });

  it('isAddressedNotClosed_shouldBeFalse_whenThreadIsClosed', () => {
    expect(isAddressedNotClosed(root(1, { resolution: 'fixed', resolved: true }))).toBe(false);
  });
});

describe('groupRoots', () => {
  it('groupRoots_shouldSplitAddressedThreads_andKeepOrderWithinEachGroup', () => {
    const roots = [root(1), root(2, { resolution: 'false_positive' }), root(3, { resolved: true, resolution: 'fixed' }), root(4, { resolution: 'fixed' })];

    const groups = groupRoots(roots);

    expect(groups.active.map((comment) => comment.id)).toEqual([1, 3]);
    expect(groups.addressed.map((comment) => comment.id)).toEqual([2, 4]);
  });
});

describe('groupRootsByRepo', () => {
  const REPOS = [{ path: 'qa-api', name: 'qa-api' }, { path: 'qa-notifier', name: 'qa-notifier' }];

  it('groupRootsByRepo_shouldFollowRepositoryOrder_andDropEmptyRepositories', () => {
    const groups = groupRootsByRepo([root(1, { target: 'qa-api/a.py' }), root(2, { target: 'qa-api/b.py' })], REPOS);

    expect(groups.map((group) => [group.repo?.path, group.roots.map((comment) => comment.id)])).toEqual([['qa-api', [1, 2]]]);
  });

  it('groupRootsByRepo_shouldPutThreadsOutsideEveryRepositoryLast', () => {
    const groups = groupRootsByRepo([root(1, { target: 'notes.md' }), root(2, { target: 'qa-notifier/send.py' })], REPOS);

    expect(groups.map((group) => [group.repo?.path, group.roots.map((comment) => comment.id)])).toEqual([['qa-notifier', [2]], [undefined, [1]]]);
  });

  it('groupRootsByRepo_shouldPreferTheDeepestRepository_whenARootCheckoutIsAttached', () => {
    const groups = groupRootsByRepo([root(1, { target: 'qa-api/a.py' }), root(2, { target: 'README.md' })], [{ path: '.', name: 'root' }, ...REPOS]);

    expect(groups.map((group) => [group.repo?.path, group.roots.map((comment) => comment.id)])).toEqual([['.', [2]], ['qa-api', [1]]]);
  });

  it('groupRootsByRepo_shouldNotMatchRepositoryWithSharedNamePrefix', () => {
    const groups = groupRootsByRepo([root(1, { target: 'qa-api-v2/a.py' })], REPOS);

    expect(groups.map((group) => group.repo)).toEqual([undefined]);
  });
});
