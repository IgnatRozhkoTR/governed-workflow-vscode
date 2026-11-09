import type { ReviewComment } from '@api-types';
import type { Tone } from '../../components/types';

export const DEFAULT_RESOLUTION = 'out_of_scope';
export const RESOLUTIONS = ['fixed', 'out_of_scope', 'false_positive'] as const;

const OPEN_RESOLUTION = 'open';
const RESOLUTION_TONES: Readonly<Record<string, Tone>> = { fixed: 'success', out_of_scope: 'neutral', false_positive: 'warning' };

export function isOpenRoot(comment: ReviewComment): boolean {
  return comment.parent_id === null && !comment.resolved;
}

export function countOpenRoots(comments: readonly ReviewComment[]): number {
  return comments.filter(isOpenRoot).length;
}

export function visibleRoots(comments: readonly ReviewComment[], showResolved: boolean): ReviewComment[] {
  return comments.filter((comment) => comment.parent_id === null && (showResolved || !comment.resolved));
}

export function hasResolutionBadge(comment: ReviewComment): comment is ReviewComment & { resolution: string } {
  return comment.resolution !== null && comment.resolution !== '' && comment.resolution !== OPEN_RESOLUTION;
}

export function resolutionTone(resolution: string): Tone {
  return RESOLUTION_TONES[resolution] ?? 'neutral';
}

export function prettifyAuthor(author: string): string {
  return author
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}
