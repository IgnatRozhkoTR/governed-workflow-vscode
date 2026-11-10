import type { ReviewComment } from '@api-types';
import { joinRepoPath } from '@shared/paths';
import type { RepoEntry } from '../../api/changes';
import type { Tone } from '../../components/types';
import { isBlockingRoot } from './reviewBlocking';

export const NO_RESOLUTION_CHOSEN = '';
export const RESOLUTIONS = ['fixed', 'out_of_scope', 'false_positive'] as const;

const OPEN_RESOLUTION = 'open';
const RESOLUTION_TONES: Readonly<Record<string, Tone>> = { fixed: 'success', out_of_scope: 'neutral', false_positive: 'warning' };
// Review agents start an issue with its severity in brackets, e.g. "[critical] Missing auth check".
const SEVERITY_PREFIX = /^\s*\[(critical|major|minor)\]\s*/i;
const SEVERITY_TONES: Readonly<Record<Severity, Tone>> = { critical: 'danger', major: 'warning', minor: 'neutral' };

export type Severity = 'critical' | 'major' | 'minor';

export interface SeverityText {
  readonly severity?: Severity;
  readonly text: string;
}

export function isInRepo(comment: ReviewComment, repo: string | undefined): boolean {
  return repo === undefined || (comment.target ?? '').startsWith(joinRepoPath(repo, ''));
}

export function visibleRoots(comments: readonly ReviewComment[], showResolved: boolean): ReviewComment[] {
  return comments.filter((comment) => comment.parent_id === null && (showResolved || !comment.resolved || isBlockingRoot(comment)));
}

export function hasResolutionBadge(comment: ReviewComment): comment is ReviewComment & { resolution: string } {
  return comment.resolution !== null && comment.resolution !== '' && comment.resolution !== OPEN_RESOLUTION;
}

// The agent records a resolution without closing the thread: it no longer blocks approval, but the user still closes it.
export function isAddressedNotClosed(comment: ReviewComment): boolean {
  return !comment.resolved && hasResolutionBadge(comment);
}

export interface ThreadGroups {
  readonly active: ReviewComment[];
  readonly addressed: ReviewComment[];
}

export function groupRoots(roots: readonly ReviewComment[]): ThreadGroups {
  return { active: roots.filter((comment) => !isAddressedNotClosed(comment)), addressed: roots.filter(isAddressedNotClosed) };
}

export interface RepoThreadGroup {
  readonly repo?: RepoEntry;
  readonly roots: ReviewComment[];
}

// Threads outside every attached repository (e.g. on workspace files) land in a trailing group without a repo.
export function groupRootsByRepo(roots: readonly ReviewComment[], repos: readonly RepoEntry[]): RepoThreadGroup[] {
  const groups: RepoThreadGroup[] = [...repos.map((repo) => ({ repo, roots: [] })), { roots: [] }];
  for (const comment of roots) {
    const owner = repoOwning(comment, repos);
    groups[owner === undefined ? repos.length : repos.indexOf(owner)].roots.push(comment);
  }
  return groups.filter((group) => group.roots.length > 0);
}

// A root checkout's prefix matches every path, so the deepest matching repository owns the thread.
function repoOwning(comment: ReviewComment, repos: readonly RepoEntry[]): RepoEntry | undefined {
  return repos.filter((repo) => isInRepo(comment, repo.path)).sort((left, right) => right.path.length - left.path.length)[0];
}

export function resolutionTone(resolution: string): Tone {
  return RESOLUTION_TONES[resolution] ?? 'neutral';
}

export function splitSeverity(text: string): SeverityText {
  const match = SEVERITY_PREFIX.exec(text);
  if (match === null) {
    return { text };
  }
  return { severity: match[1].toLowerCase() as Severity, text: text.slice(match[0].length) };
}

export function severityTone(severity: Severity): Tone {
  return SEVERITY_TONES[severity];
}
