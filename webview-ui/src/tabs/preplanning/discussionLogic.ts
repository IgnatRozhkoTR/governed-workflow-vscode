import type { Discussion, ResearchEntry } from '@api-types';

const OPEN_STATUS = 'open';
const RESEARCH_TYPE = 'research';
const PROVEN = 1;

export interface DiscussionFilter {
  readonly showResolved: boolean;
  readonly showProven: boolean;
}

export function isResearchDiscussion(discussion: Discussion): boolean {
  return discussion.type === RESEARCH_TYPE;
}

export function provenDiscussionIds(research: readonly ResearchEntry[]): ReadonlySet<number> {
  const ids = research
    .filter((entry) => entry.proven === PROVEN && entry.discussion_id !== null)
    .map((entry) => entry.discussion_id as number);
  return new Set(ids);
}

export function countOpenDiscussions(discussions: readonly Discussion[]): number {
  return discussions.filter((discussion) => discussion.status === OPEN_STATUS).length;
}

export function countPendingResearchDiscussions(discussions: readonly Discussion[], provenIds: ReadonlySet<number>): number {
  return discussions.filter((discussion) => isResearchDiscussion(discussion) && !provenIds.has(discussion.id)).length;
}

export function isDiscussionDone(discussion: Discussion, provenIds: ReadonlySet<number>): boolean {
  return isResearchDiscussion(discussion) ? provenIds.has(discussion.id) : discussion.status === 'resolved';
}

export function visibleDiscussions(
  discussions: readonly Discussion[],
  provenIds: ReadonlySet<number>,
  filter: DiscussionFilter,
): Discussion[] {
  const visible = discussions.filter((discussion) => {
    if (isResearchDiscussion(discussion)) {
      return filter.showProven || !provenIds.has(discussion.id);
    }
    return filter.showResolved || discussion.status !== 'resolved';
  });
  const openRank = (discussion: Discussion): number => (discussion.status === OPEN_STATUS ? 0 : 1);
  return visible
    .map((discussion, index) => ({ discussion, index }))
    .sort((a, b) => openRank(a.discussion) - openRank(b.discussion) || a.index - b.index)
    .map((entry) => entry.discussion);
}
