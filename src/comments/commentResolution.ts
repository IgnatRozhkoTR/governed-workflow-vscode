import type { ReviewComment } from '../api/types';
import { CODE_COMMENT_SCOPE, codePathOf, rootComments, type CommentsByTarget } from './commentMapping';

export const RESOLVE_CONCURRENCY = 4;

export interface ResolveFailure {
  readonly subject: string;
  readonly threadCount: number;
  readonly reason: string;
}

export interface ResolveOutcome {
  readonly resolvedIds: readonly number[];
  readonly failures: readonly ResolveFailure[];
}

export interface ResolveAllPlan {
  readonly reviewRoots: readonly ReviewComment[];
  readonly otherRoots: readonly ReviewComment[];
}

export function openRoots(commentsByTarget: CommentsByTarget): ReviewComment[] {
  return rootComments(commentsByTarget).filter((comment) => !comment.resolved);
}

export function openRootsInFile(commentsByTarget: CommentsByTarget, filePath: string): ReviewComment[] {
  return openRoots(commentsByTarget).filter((comment) => codePathOf(comment) === filePath);
}

// Review threads go through the server's resolve-all endpoint; it only covers the review scope.
export function planResolveAll(roots: readonly ReviewComment[]): ResolveAllPlan {
  return {
    reviewRoots: roots.filter((comment) => comment.scope === CODE_COMMENT_SCOPE),
    otherRoots: roots.filter((comment) => comment.scope !== CODE_COMMENT_SCOPE),
  };
}

export function failedThreadCount(outcome: ResolveOutcome): number {
  return outcome.failures.reduce((total, failure) => total + failure.threadCount, 0);
}

export function mergeOutcomes(outcomes: readonly ResolveOutcome[]): ResolveOutcome {
  return {
    resolvedIds: outcomes.flatMap((outcome) => outcome.resolvedIds),
    failures: outcomes.flatMap((outcome) => outcome.failures),
  };
}

export async function resolveEach(
  rootIds: readonly number[],
  resolveOne: (rootId: number) => Promise<void>,
): Promise<ResolveOutcome> {
  const results = await settleWithLimit(rootIds, RESOLVE_CONCURRENCY, resolveOne);
  const resolvedIds: number[] = [];
  const failures: ResolveFailure[] = [];
  results.forEach((result, index) => {
    const rootId = rootIds[index];
    if (result.status === 'fulfilled') {
      resolvedIds.push(rootId);
    } else {
      failures.push({ subject: `thread #${rootId}`, threadCount: 1, reason: reasonOf(result.reason) });
    }
  });
  return { resolvedIds, failures };
}

export async function settleWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
