import { describe, expect, it } from 'vitest';
import { openRootsInFile, planResolveAll, resolveEach, settleWithLimit } from '../src/comments/commentResolution';
import { makeComment } from './support/fixtures';

function reviewComment(id: number, filePath: string, overrides: Parameters<typeof makeComment>[0] = {}) {
  return makeComment({ id, scope: 'review', target: filePath, file_path: filePath, line_start: 1, line_end: 1, resolution: 'open', ...overrides });
}

describe('openRootsInFile', () => {
  it('openRootsInFile_shouldReturnOnlyOpenRootsOfThatFile', () => {
    const byTarget = {
      'a.ts': [reviewComment(1, 'a.ts'), reviewComment(2, 'a.ts', { resolved: true }), reviewComment(3, 'a.ts', { parent_id: 1 })],
      'b.ts': [reviewComment(4, 'b.ts')],
    };

    expect(openRootsInFile(byTarget, 'a.ts').map((comment) => comment.id)).toEqual([1]);
  });

  it('openRootsInFile_shouldIncludeFileLevelComments_thatOnlyCarryTheTarget', () => {
    const byTarget = { 'a.ts': [makeComment({ id: 5, scope: 'review', target: 'a.ts', file_path: null })] };

    expect(openRootsInFile(byTarget, 'a.ts').map((comment) => comment.id)).toEqual([5]);
  });

  it('openRootsInFile_shouldIgnoreNonCodeScopes_withMatchingTarget', () => {
    const byTarget = { 'a.ts': [makeComment({ id: 6, scope: 'plan', target: 'a.ts' })] };

    expect(openRootsInFile(byTarget, 'a.ts')).toEqual([]);
  });
});

describe('planResolveAll', () => {
  it('planResolveAll_shouldSplitReviewThreadsFromOtherScopes', () => {
    const plan = planResolveAll([reviewComment(1, 'a.ts'), makeComment({ id: 2, scope: 'research' }), reviewComment(3, 'b.ts')]);

    expect(plan.reviewRoots.map((comment) => comment.id)).toEqual([1, 3]);
    expect(plan.otherRoots.map((comment) => comment.id)).toEqual([2]);
  });
});

describe('settleWithLimit', () => {
  it('settleWithLimit_shouldNeverRunMoreThanLimitTasksAtOnce', async () => {
    let running = 0;
    let peak = 0;
    const task = async (value: number): Promise<number> => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      return value * 2;
    };

    const results = await settleWithLimit([1, 2, 3, 4, 5, 6, 7], 3, task);

    expect(peak).toBe(3);
    expect(results.map((result) => (result.status === 'fulfilled' ? result.value : undefined))).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it('settleWithLimit_shouldReturnEmpty_whenThereAreNoItems', async () => {
    expect(await settleWithLimit([], 4, async () => 1)).toEqual([]);
  });
});

describe('resolveEach', () => {
  it('resolveEach_shouldReportFailuresAndKeepResolvingTheRest', async () => {
    const outcome = await resolveEach([1, 2, 3], async (rootId) => {
      if (rootId === 2) {
        throw new Error('gone');
      }
    });

    expect(outcome.resolvedIds).toEqual([1, 3]);
    expect(outcome.failures).toEqual([{ subject: 'thread #2', threadCount: 1, reason: 'gone' }]);
  });
});
