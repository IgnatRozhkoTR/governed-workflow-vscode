import type { Reply, ReviewComment } from '../api/types';
import { lineHash } from './lineHash';

export type ThreadReply = Pick<Reply, 'id' | 'text' | 'author' | 'created_at'>;

export interface ReviewThread {
  readonly filePath: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly root: ReviewComment;
  readonly replies: readonly ThreadReply[];
}

type AnchoredRoot = ReviewComment & { readonly file_path: string; readonly line_start: number };

export function threadKey(filePath: string, lineStart: number): string {
  return `${filePath}#${lineStart}`;
}

export function groupReviewThreads(comments: readonly ReviewComment[]): ReadonlyMap<string, ReviewThread[]> {
  const threadsByKey = new Map<string, ReviewThread[]>();
  for (const root of comments.filter(isLineAnchoredRoot)) {
    const thread = toThread(root, comments);
    const key = threadKey(thread.filePath, thread.lineStart);
    threadsByKey.set(key, [...(threadsByKey.get(key) ?? []), thread]);
  }
  return threadsByKey;
}

export function isOutdated(comment: Pick<ReviewComment, 'line_hash'>, currentLineText: string): boolean {
  return comment.line_hash !== null && comment.line_hash !== lineHash(currentLineText);
}

function isLineAnchoredRoot(comment: ReviewComment): comment is AnchoredRoot {
  return comment.parent_id === null && Boolean(comment.file_path) && comment.line_start !== null;
}

function toThread(root: AnchoredRoot, comments: readonly ReviewComment[]): ReviewThread {
  return {
    filePath: root.file_path,
    lineStart: root.line_start,
    lineEnd: Math.max(root.line_end ?? root.line_start, root.line_start),
    root,
    replies: collectReplies(root, comments),
  };
}

function collectReplies(root: ReviewComment, comments: readonly ReviewComment[]): ThreadReply[] {
  const nested = root.replies ?? [];
  const nestedIds = new Set(nested.map((reply) => reply.id));
  const flat = comments.filter((comment) => comment.parent_id === root.id && !nestedIds.has(comment.id));
  return [...nested, ...flat].sort((left, right) => left.id - right.id);
}
