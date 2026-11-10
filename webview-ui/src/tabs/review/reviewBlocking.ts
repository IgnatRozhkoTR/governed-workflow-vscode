import type { ReviewComment, WorkspaceState } from '@api-types';
import { isApprovalBlocker } from '../../../../src/comments/commentMapping';
import { REVIEW_SCOPE } from '../../lib/comments';

export type CommentsState = Pick<WorkspaceState, 'comments'>;

export function isBlockingRoot(comment: ReviewComment): boolean {
  return comment.scope === REVIEW_SCOPE && isApprovalBlocker(comment);
}

export function isResolvedButBlocking(comment: ReviewComment): boolean {
  return comment.resolved && isBlockingRoot(comment);
}

// Counts with the server's approve guard rule, so every view reports the same number the gate enforces.
export function blockingRoots(state: CommentsState): ReviewComment[] {
  return Object.values(state.comments).flat().filter(isBlockingRoot);
}

// Resolve all only touches roots that are still unresolved, so its count must not include resolved blockers.
export function unresolvedRootCount(state: CommentsState): number {
  return Object.values(state.comments).flat().filter((comment) => comment.scope === REVIEW_SCOPE && comment.parent_id === null && !comment.resolved).length;
}

// Resolved by the user yet still counted by the approve guard: they are not in Resolve all's count, so the UI says they need closing separately.
export function resolvedBlockingCount(state: CommentsState): number {
  return blockingRoots(state).filter(isResolvedButBlocking).length;
}

// Code Changes counts per file and folder with the same rule, so its numbers add up to the Review badge.
export function blockingCountsByTarget(state: CommentsState): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const comment of blockingRoots(state)) {
    const target = comment.target ?? '';
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return counts;
}
