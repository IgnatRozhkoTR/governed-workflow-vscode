import type { WorkspaceState } from '@api-types';
import { listProposals } from '../api/reflection';
import { openCountAll } from '../lib/comments';
import { countOpenDiscussions, provenDiscussionIds } from '../tabs/preplanning/discussionLogic';
import { countPending } from '../tabs/reflection/proposalsModel';
import { useResource, useStore } from './hooks';

const VERIFIED = 1;
const REJECTED = -1;

export interface AttentionCounts {
  readonly openComments: number;
  readonly pendingProposals: number;
  readonly pendingResearch: number;
  readonly openDiscussions: number;
}

type StateCounts = Omit<AttentionCounts, 'pendingProposals'>;

const NO_STATE_COUNTS: StateCounts = { openComments: 0, pendingResearch: 0, openDiscussions: 0 };

export function selectStateAttention(state: WorkspaceState | null): StateCounts {
  if (state === null) {
    return NO_STATE_COUNTS;
  }
  return {
    openComments: openCountAll(state),
    pendingResearch: state.research.filter((entry) => entry.proven !== VERIFIED && entry.proven !== REJECTED).length,
    openDiscussions: countOpenDiscussions(state.discussions, provenDiscussionIds(state.research)),
  };
}

function isSameCounts(left: StateCounts, right: StateCounts): boolean {
  return left.openComments === right.openComments && left.pendingResearch === right.pendingResearch && left.openDiscussions === right.openDiscussions;
}

export function useAttentionCounts(): AttentionCounts {
  const stateCounts = useStore((s) => selectStateAttention(s.state), isSameCounts);
  const proposals = useResource('proposals', 'attention', listProposals);
  return { ...stateCounts, pendingProposals: countPending(proposals.data?.proposals ?? []) };
}
