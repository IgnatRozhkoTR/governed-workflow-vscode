import type { ProgressEntry, ReviewComment, WorkspaceState } from '@api-types';
import type { Proposal } from '../../api/reflection';
import { formatDate, parseServerDate } from '../../lib/format';

const APPLIED_PROPOSAL_STATUS = 'executed';
const REJECTED_PROPOSAL_STATUS = 'rejected';

export interface TicketDates {
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export interface ThreadCounts {
  readonly total: number;
  readonly resolved: number;
}

export interface ProposalCounts {
  readonly applied: number;
  readonly rejected: number;
}

export function ticketDates(state: Pick<WorkspaceState, 'phase' | 'phaseHistory' | 'progress'>): TicketDates {
  const candidates = [
    ...state.phaseHistory.map((transition) => transition.time),
    ...Object.values(state.progress).map((entry: ProgressEntry) => entry.created_at),
  ];
  const finishing = state.phaseHistory.filter((transition) => transition.to === state.phase);
  return { startedAt: earliest(candidates), finishedAt: finishing[finishing.length - 1]?.time };
}

function earliest(timestamps: readonly string[]): string | undefined {
  const valid = timestamps.filter((timestamp) => !Number.isNaN(parseServerDate(timestamp).getTime()));
  return valid.reduce<string | undefined>(
    (best, timestamp) => (best === undefined || parseServerDate(timestamp) < parseServerDate(best) ? timestamp : best),
    undefined,
  );
}

export interface TicketSpan {
  readonly showFinished: boolean;
  readonly durationMs?: number;
}

export function ticketSpan(dates: TicketDates): TicketSpan {
  if (dates.startedAt === undefined || dates.finishedAt === undefined) {
    return { showFinished: dates.finishedAt !== undefined };
  }
  if (formatDate(dates.startedAt) === formatDate(dates.finishedAt)) {
    return { showFinished: false };
  }
  const durationMs = parseServerDate(dates.finishedAt).getTime() - parseServerDate(dates.startedAt).getTime();
  return { showFinished: true, durationMs: durationMs > 0 ? durationMs : undefined };
}

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export interface DurationParts {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
}

export function splitDuration(durationMs: number): DurationParts {
  const totalMinutes = Math.max(1, Math.round(durationMs / MS_PER_MINUTE));
  const totalHours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  return { days: Math.floor(totalHours / HOURS_PER_DAY), hours: totalHours % HOURS_PER_DAY, minutes: totalMinutes % MINUTES_PER_HOUR };
}

export function countThreads(comments: Readonly<Record<string, readonly ReviewComment[]>>): ThreadCounts {
  const roots = Object.values(comments).flat().filter((comment) => comment.parent_id === null);
  return { total: roots.length, resolved: roots.filter((comment) => comment.resolved).length };
}

export function countProposals(proposals: readonly Proposal[]): ProposalCounts {
  return {
    applied: proposals.filter((proposal) => proposal.status === APPLIED_PROPOSAL_STATUS).length,
    rejected: proposals.filter((proposal) => proposal.status === REJECTED_PROPOSAL_STATUS).length,
  };
}
