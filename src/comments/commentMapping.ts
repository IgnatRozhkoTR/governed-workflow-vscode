import type { NewComment, Reply, ReviewComment } from '../api/types';
import { lineHash } from './lineHash';

// The web stores every code comment, on a diff line, a file or a directory, under the review scope with the path as target.
export const CODE_COMMENT_SCOPE = 'review';
const USER_AUTHOR = 'user';
const CURRENT_USER_LABEL = 'You';
const OPEN_RESOLUTION = 'open';

export type ThreadMessage = Pick<Reply, 'id' | 'text' | 'author' | 'created_at'>;

export interface LineSpan {
  readonly start: number;
  readonly end: number;
}

export interface CodeThread {
  readonly root: ReviewComment;
  readonly replies: readonly ThreadMessage[];
  readonly filePath: string;
  readonly lines: LineSpan | undefined;
}

export interface Placement {
  readonly lines: LineSpan;
  readonly isOutdated: boolean;
}

export type CommentsByTarget = Readonly<Record<string, readonly ReviewComment[]>>;

// Mirrors the server's approve guard (ReviewGuard): a review root blocks approval while its resolution is 'open',
// whatever its resolved flag says, so no client view reports fewer blockers than the gate does.
export function isApprovalBlocker(comment: Pick<ReviewComment, 'parent_id' | 'resolution'>): boolean {
  return comment.parent_id === null && comment.resolution === OPEN_RESOLUTION;
}

export function rootComments(commentsByTarget: CommentsByTarget): ReviewComment[] {
  return Object.values(commentsByTarget)
    .flat()
    .filter((comment) => comment.parent_id === null)
    .sort((left, right) => left.id - right.id);
}

export function codePathOf(comment: Pick<ReviewComment, 'scope' | 'file_path' | 'target'>): string | undefined {
  if (comment.scope !== CODE_COMMENT_SCOPE) {
    return undefined;
  }
  return comment.file_path || comment.target || undefined;
}

export function codeThreads(commentsByTarget: CommentsByTarget): CodeThread[] {
  const threads: CodeThread[] = [];
  for (const root of rootComments(commentsByTarget)) {
    const filePath = codePathOf(root);
    if (filePath !== undefined) {
      threads.push({ root, replies: sortedReplies(root), filePath, lines: lineSpanOf(root) });
    }
  }
  return threads;
}

export function lineSpanOf(comment: Pick<ReviewComment, 'line_start' | 'line_end'>): LineSpan | undefined {
  if (comment.line_start === null) {
    return undefined;
  }
  return { start: comment.line_start, end: Math.max(comment.line_end ?? comment.line_start, comment.line_start) };
}

export function hashLines(lines: readonly string[]): string[] {
  return lines.map(lineHash);
}

export function placeLines(lines: LineSpan, storedHash: string | null, documentHashes: readonly string[]): Placement {
  const lineCount = Math.max(documentHashes.length, 1);
  if (storedHash === null) {
    return { lines: clampSpan(lines, lineCount), isOutdated: false };
  }
  const matchIndex = nearestIndexOf(documentHashes, storedHash, lines.start - 1);
  if (matchIndex === undefined) {
    return { lines: clampSpan(lines, lineCount), isOutdated: true };
  }
  const shift = matchIndex + 1 - lines.start;
  return { lines: clampSpan({ start: lines.start + shift, end: lines.end + shift }, lineCount), isOutdated: false };
}

export function isOutdated(comment: Pick<ReviewComment, 'line_hash'>, currentLineText: string): boolean {
  return comment.line_hash !== null && comment.line_hash !== lineHash(currentLineText);
}

export function newLineComment(relPath: string, lines: LineSpan, startLineText: string, text: string): NewComment {
  return {
    scope: CODE_COMMENT_SCOPE,
    target: relPath,
    file_path: relPath,
    line_start: lines.start,
    line_end: lines.end,
    line_hash: lineHash(startLineText),
    text: text.trim(),
    author: USER_AUTHOR,
  };
}

// File and directory comments carry no file_path, exactly like the web's comment icon on a diff file row.
export function newFileComment(relPath: string, text: string): NewComment {
  return { scope: CODE_COMMENT_SCOPE, target: relPath, text: text.trim(), author: USER_AUTHOR };
}

export function provisionalRoot(id: number, comment: NewComment, createdAt: string): ReviewComment {
  return {
    id,
    parent_id: null,
    scope: comment.scope,
    target: comment.target ?? null,
    file_path: comment.file_path ?? null,
    line_start: comment.line_start ?? null,
    line_end: comment.line_end ?? null,
    line_hash: comment.line_hash ?? null,
    text: comment.text,
    author: comment.author ?? USER_AUTHOR,
    type: null,
    created_at: createdAt,
    resolved: false,
    resolved_at: null,
    resolution: comment.scope === CODE_COMMENT_SCOPE ? OPEN_RESOLUTION : null,
    replies: [],
  };
}

export function threadSignature(thread: CodeThread): string {
  const { root } = thread;
  const messages = [root, ...thread.replies].map((message) => [message.id, message.author, message.created_at, message.text]);
  return JSON.stringify([root.resolved, root.resolution, messages]);
}

export function authorLabel(author: string): string {
  if (author === USER_AUTHOR) {
    return CURRENT_USER_LABEL;
  }
  const words = author.split(/[-_]/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return author;
  }
  const [first, ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
}

export function resolutionLabel(resolution: string | null): string | undefined {
  if (resolution === null || resolution === '' || resolution === OPEN_RESOLUTION) {
    return undefined;
  }
  return resolution.replace(/_/g, ' ');
}

function sortedReplies(root: ReviewComment): ThreadMessage[] {
  return [...(root.replies ?? [])].sort((left, right) => left.id - right.id);
}

function nearestIndexOf(hashes: readonly string[], hash: string, origin: number): number | undefined {
  const maxDistance = Math.max(origin, hashes.length - 1 - origin);
  for (let distance = 0; distance <= maxDistance; distance++) {
    for (const index of [origin - distance, origin + distance]) {
      if (index >= 0 && index < hashes.length && hashes[index] === hash) {
        return index;
      }
    }
  }
  return undefined;
}

function clampSpan(lines: LineSpan, lineCount: number): LineSpan {
  const start = Math.min(Math.max(lines.start, 1), lineCount);
  const end = Math.min(Math.max(lines.end, start), lineCount);
  return { start, end };
}
