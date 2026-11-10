import type { ReviewComment } from '@api-types';
import { describe, expect, it } from 'vitest';
import { blockingCountsByTarget, blockingRoots, isResolvedButBlocking, resolvedBlockingCount, unresolvedRootCount } from '../../../webview-ui/src/tabs/review/reviewBlocking';
import { visibleRoots } from '../../../webview-ui/src/tabs/review/reviewModel';

function root(id: number, overrides: Partial<ReviewComment> = {}): ReviewComment {
  return { id, parent_id: null, scope: 'review', target: 'app/a.py', resolved: false, resolution: 'open', ...overrides } as ReviewComment;
}

// The QA-1234 shape: 7 unresolved roots plus one the user resolved while its resolution stayed 'open'.
const QA_1234 = {
  comments: {
    'review:app/a.py': [1, 2, 3, 4].map((id) => root(id)),
    'review:app/b.py': [5, 6, 7].map((id) => root(id, { target: 'app/b.py' })),
    'review:app/c.py': [root(8, { target: 'app/c.py', resolved: true }), root(9, { target: 'app/c.py', resolved: true, resolution: 'fixed' })],
    'plan:Entire plan': [root(10, { scope: 'plan', resolution: null })],
  },
};

describe('approve guard rule', () => {
  it('blockingRoots_shouldMatchServerGuardCount_whenAResolvedThreadKeepsOpenResolution', () => {
    expect(blockingRoots(QA_1234).map((comment) => comment.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('blockingRoots_shouldSkipRootsWithAFinalResolution_evenWhenUnresolved', () => {
    expect(blockingRoots({ comments: { 'review:x': [root(1, { resolution: 'false_positive' })] } })).toEqual([]);
  });

  it('isResolvedButBlocking_shouldFlagOnlyResolvedRootsWithOpenResolution', () => {
    expect(isResolvedButBlocking(root(8, { resolved: true }))).toBe(true);
    expect(isResolvedButBlocking(root(9, { resolved: true, resolution: 'fixed' }))).toBe(false);
    expect(isResolvedButBlocking(root(1))).toBe(false);
  });

  it('unresolvedRootCount_shouldCountWhatResolveAllWillTouch', () => {
    expect(unresolvedRootCount(QA_1234)).toBe(7);
  });

  it('resolvedBlockingCount_shouldCountOnlyResolvedRootsTheGuardStillCounts', () => {
    expect(resolvedBlockingCount(QA_1234)).toBe(1);
  });

  it('visibleRoots_shouldKeepResolvedBlockers_whenResolvedThreadsAreHidden', () => {
    const roots = QA_1234.comments['review:app/c.py'];

    expect(visibleRoots(roots, false).map((comment) => comment.id)).toEqual([8]);
  });
});

describe('blockingCountsByTarget', () => {
  it('blockingCountsByTarget_shouldCountPerTargetWithTheApproveGuardRule', () => {
    expect(blockingCountsByTarget(QA_1234)).toEqual(new Map([['app/a.py', 4], ['app/b.py', 3], ['app/c.py', 1]]));
  });
});
