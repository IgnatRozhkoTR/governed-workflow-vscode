import type { ReviewComment } from '../api/types';
import type { NavTarget, TabId } from '../shared/navigation';
import { CODE_COMMENT_SCOPE, codePathOf, rootComments, type CommentsByTarget } from './commentMapping';

export type CommentFilter = 'open' | 'resolved' | 'all';

export const COMMENT_FILTERS: readonly CommentFilter[] = ['open', 'resolved', 'all'];

export interface TargetGroup {
  readonly scope: string;
  readonly target: string;
  readonly comments: readonly ReviewComment[];
  readonly openCount: number;
}

export interface AreaGroup {
  readonly scope: string;
  readonly label: string;
  readonly targets: readonly TargetGroup[];
  readonly openCount: number;
  readonly commentCount: number;
}

const AREA_ORDER: readonly string[] = ['plan', 'architecture', 'scope', 'criteria', 'research', 'impact', CODE_COMMENT_SCOPE, 'phase'];

const AREA_LABELS: Readonly<Record<string, string>> = {
  plan: 'Plan',
  architecture: 'Architecture',
  scope: 'Scope',
  criteria: 'Acceptance Criteria',
  research: 'Research',
  impact: 'Impact Analysis',
  [CODE_COMMENT_SCOPE]: 'Code',
  phase: 'Phase Feedback',
};

// Where the control panel renders the <Commentable> for each scope (contract §9).
const PANEL_TABS: Readonly<Record<string, TabId>> = {
  plan: 'planning',
  architecture: 'planning',
  scope: 'planning',
  criteria: 'planning',
  research: 'research',
  impact: 'preplanning',
  [CODE_COMMENT_SCOPE]: 'changes',
  phase: 'phase',
};

export function matchesFilter(comment: Pick<ReviewComment, 'resolved'>, filter: CommentFilter): boolean {
  switch (filter) {
    case 'open':
      return !comment.resolved;
    case 'resolved':
      return comment.resolved;
    case 'all':
      return true;
  }
}

export function countOpenComments(commentsByTarget: CommentsByTarget): number {
  return rootComments(commentsByTarget).filter((comment) => !comment.resolved).length;
}

export function groupCommentsByArea(commentsByTarget: CommentsByTarget, filter: CommentFilter): AreaGroup[] {
  const visible = rootComments(commentsByTarget).filter((comment) => matchesFilter(comment, filter));
  return [...groupBy(visible, (comment) => comment.scope)]
    .map(([scope, comments]) => toAreaGroup(scope, comments))
    .sort(compareAreas);
}

export function areaLabel(scope: string): string {
  return AREA_LABELS[scope] ?? scope.charAt(0).toUpperCase() + scope.slice(1);
}

export function isCodeComment(comment: Pick<ReviewComment, 'scope' | 'file_path' | 'target'>): boolean {
  return codePathOf(comment) !== undefined;
}

export function panelNavFor(comment: Pick<ReviewComment, 'scope' | 'target'>): NavTarget | undefined {
  const tab = PANEL_TABS[comment.scope];
  return tab === undefined ? undefined : { tab, comment: { scope: comment.scope, target: comment.target ?? '' } };
}

function toAreaGroup(scope: string, comments: readonly ReviewComment[]): AreaGroup {
  const targets = [...groupBy(comments, (comment) => comment.target ?? '')].map(([target, targetComments]) => ({
    scope,
    target,
    comments: targetComments,
    openCount: countOpen(targetComments),
  }));
  return { scope, label: areaLabel(scope), targets, openCount: countOpen(comments), commentCount: comments.length };
}

function compareAreas(left: AreaGroup, right: AreaGroup): number {
  return areaRank(left.scope) - areaRank(right.scope) || left.label.localeCompare(right.label);
}

function areaRank(scope: string): number {
  const index = AREA_ORDER.indexOf(scope);
  return index === -1 ? AREA_ORDER.length : index;
}

function countOpen(comments: readonly ReviewComment[]): number {
  return comments.filter((comment) => !comment.resolved).length;
}

function groupBy(comments: readonly ReviewComment[], keyOf: (comment: ReviewComment) => string): Map<string, ReviewComment[]> {
  const groups = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    const key = keyOf(comment);
    groups.set(key, [...(groups.get(key) ?? []), comment]);
  }
  return groups;
}
