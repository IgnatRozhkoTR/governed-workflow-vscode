import type { ReviewComment, WorkspaceState } from '@api-types';

const NO_COMMENTS: readonly ReviewComment[] = [];

export function commentKey(scope: string, target: string | null | undefined): string {
  return `${scope}:${target ?? ''}`;
}

export function rootsWithReplies(state: WorkspaceState, scope: string, target: string | null | undefined): readonly ReviewComment[] {
  return state.comments[commentKey(scope, target)] ?? NO_COMMENTS;
}

export function openCount(state: WorkspaceState, scope: string, target: string | null | undefined): number {
  return rootsWithReplies(state, scope, target).filter((comment) => !comment.resolved).length;
}

export function openCountByScope(state: WorkspaceState, scope: string): number {
  const prefix = `${scope}:`;
  return Object.entries(state.comments)
    .filter(([key]) => key.startsWith(prefix))
    .reduce((total, [, comments]) => total + comments.filter((comment) => !comment.resolved).length, 0);
}
