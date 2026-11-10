import type { Criterion, Plan, ResearchEntry, ReviewComment } from '@api-types';
import { REVIEW_BLOCKING_NAV, type NavTarget } from '@shared/navigation';
import type { Codicon } from '../components/types';
import { REVIEW_SCOPE } from '../lib/comments';
import type { Resource } from '../store/hooks';

export interface DigestItem {
  readonly id: string;
  readonly icon: Codicon;
  readonly chip: string;
  readonly detail: string;
  // Absent when there is nothing to open, e.g. zero blocking threads: the chip then reads as plain text.
  readonly nav?: NavTarget;
  readonly isWarning?: boolean;
}

// Something the user may want to settle before approving. As a warning it never blocks Approve; as a blocker it is
// what the server's approve guard refuses on, so Approve explains it instead of posting.
export interface GateWarning {
  readonly id: string;
  readonly messageKey: string;
  // The message is a counted phrase with .one/.few/.many/.other forms rather than a label followed by the number.
  readonly hasPluralForms?: boolean;
  readonly count: number;
  // Placeholders the message needs beyond the count.
  readonly params?: Readonly<Record<string, string | number>>;
  readonly nav: NavTarget;
}

export interface PlanShape {
  readonly subPhases: number;
  readonly tasks: number;
}

export interface CriteriaCounts {
  readonly total: number;
  readonly accepted: number;
  readonly pending: number;
  readonly rejected: number;
}

export interface ResearchCounts {
  readonly proven: number;
  readonly rejected: number;
  readonly unproven: number;
  readonly total: number;
}

const PROVEN = 1;
const REJECTED_RESEARCH = -1;
const ACCEPTED_CRITERION = 'accepted';
const PROPOSED_CRITERION = 'proposed';
const REJECTED_CRITERION = 'rejected';
const RESEARCH_NAV: NavTarget = { tab: 'preplanning', anchor: 'preplanning-research' };
const DISCUSSIONS_NAV: NavTarget = { tab: 'preplanning', anchor: 'preplanning-discussions' };
const CRITERIA_NAV: NavTarget = { tab: 'planning', anchor: 'plan-criteria' };
// The first diagram that fails to render; arriving there opens the diagrams card.
export const FAILED_DIAGRAM_ANCHOR = 'plan-diagram-failed';
const FAILED_DIAGRAM_NAV: NavTarget = { tab: 'planning', anchor: FAILED_DIAGRAM_ANCHOR };
// The digest's threads chip shares this id, so blocking threads turn that one chip into a warning instead of adding a second.
export const THREADS_ITEM_ID = 'threads';
const SCOPE_NAV: NavTarget = { tab: 'planning', anchor: 'plan-scope' };
const CHANGES_NAV: NavTarget = { tab: 'changes' };
const VERIFICATION_NAV: NavTarget = { tab: 'phase', anchor: 'verification-results' };
export const VERIFICATION_ITEM_ID = 'verification';
const FAILED_RUN_STATUSES: ReadonlySet<string> = new Set(['failed', 'error', 'timeout', 'cancelled']);
const LOADING_VALUE = '…';
const UNAVAILABLE_VALUE = '—';

export function planShape(plan: Plan): PlanShape {
  const subPhases = plan.execution ?? [];
  return { subPhases: subPhases.length, tasks: subPhases.reduce((sum, subPhase) => sum + (subPhase.tasks ?? []).length, 0) };
}

export function criteriaCounts(criteria: readonly Criterion[]): CriteriaCounts {
  return {
    total: criteria.length,
    accepted: criteria.filter((criterion) => criterion.status === ACCEPTED_CRITERION).length,
    pending: criteria.filter((criterion) => criterion.status === PROPOSED_CRITERION).length,
    rejected: criteria.filter((criterion) => criterion.status === REJECTED_CRITERION).length,
  };
}

export function researchCounts(research: readonly ResearchEntry[]): ResearchCounts {
  const proven = research.filter((entry) => entry.proven === PROVEN).length;
  const rejected = research.filter((entry) => entry.proven === REJECTED_RESEARCH).length;
  return { proven, rejected, unproven: research.length - proven - rejected, total: research.length };
}

function presentWarnings(candidates: readonly GateWarning[]): GateWarning[] {
  return candidates.filter((warning) => warning.count > 0);
}

export function preplanningWarnings(research: ResearchCounts, openDiscussions: number): GateWarning[] {
  return presentWarnings([
    { id: 'research-rejected', messageKey: 'vsc.warning.researchRejected', count: research.rejected, nav: RESEARCH_NAV },
    { id: 'research-unproven', messageKey: 'vsc.warning.researchUnproven', count: research.unproven, nav: RESEARCH_NAV },
    { id: 'discussions', messageKey: 'vsc.attention.openDiscussions', count: openDiscussions, nav: DISCUSSIONS_NAV },
  ]);
}

export interface PlanWarningInput {
  readonly criteria?: CriteriaCounts;
  readonly failedDiagrams?: number;
  readonly isScopeEmpty: boolean;
}

// Counts still loading raise no warning yet; an empty scope is one warning with no number of its own.
// Proposed criteria are no warning: approving the plan accepts them all (criteria_service.accept_all_proposed).
export function planWarnings({ criteria, failedDiagrams, isScopeEmpty }: PlanWarningInput): GateWarning[] {
  return presentWarnings([
    { id: 'criteria-rejected', messageKey: 'vsc.warning.criteriaRejected', count: criteria?.rejected ?? 0, nav: CRITERIA_NAV },
    { id: 'diagrams-failed', messageKey: 'vsc.warning.diagramsFailed', count: failedDiagrams ?? 0, nav: FAILED_DIAGRAM_NAV },
    { id: 'scope-empty', messageKey: 'vsc.warning.scopeEmpty', count: isScopeEmpty ? 1 : 0, nav: SCOPE_NAV },
  ]);
}

// Open review threads at 3.N.3 and 4.2: outside YOLO the server's approve guard refuses the approval, so they are
// blockers; in YOLO it skips its guards, so they are only worth checking first.
export function reviewThreadFindings(blockingThreads: number, resolvedButBlocking: number, isYolo: boolean): { readonly warnings: GateWarning[]; readonly blockers: GateWarning[] } {
  const threads = presentWarnings([threadsBlockerWarning(blockingThreads, resolvedButBlocking)]);
  return isYolo ? { warnings: threads, blockers: [] } : { warnings: [], blockers: threads };
}

// Threads resolved without a result still count for the server's guard but not for Resolve all, so the count names them
// and the two numbers add up wherever they are read side by side.
export function threadsBlockerWarning(blockingThreads: number, resolvedButBlocking: number): GateWarning {
  const base = { id: THREADS_ITEM_ID, hasPluralForms: true, count: blockingThreads, nav: REVIEW_BLOCKING_NAV };
  return resolvedButBlocking > 0
    ? { ...base, messageKey: 'vsc.blocker.threadsWithResolved', params: { resolved: resolvedButBlocking } }
    : { ...base, messageKey: 'vsc.blocker.threads' };
}

// A commit approved with verification never run, or with its last run failed, is worth a second look; it never blocks.
export function verificationWarnings(runStatus: string | undefined, statusLabel: string): GateWarning[] {
  const isWorthChecking = runStatus === undefined || FAILED_RUN_STATUSES.has(runStatus);
  return isWorthChecking ? [{ id: VERIFICATION_ITEM_ID, messageKey: 'vsc.digest.verificationChip', count: 1, params: { status: statusLabel }, nav: VERIFICATION_NAV }] : [];
}

export interface BranchFiles {
  readonly total: number;
  readonly uncommitted: number;
}

// The branch diff runs from the base to the working tree, so its files include the uncommitted ones; the committed
// rest is the difference.
export function committedFileCount(files: BranchFiles): number {
  return files.total - files.uncommitted;
}

// Approving a commit gate commits the working tree, so the dialog says which files that adds.
export function uncommittedFileNotes(files: BranchFiles | undefined): GateWarning[] {
  return presentWarnings([{ id: 'uncommitted', messageKey: 'vsc.notice.uncommittedFiles', hasPluralForms: true, count: files?.uncommitted ?? 0, nav: CHANGES_NAV }]);
}

// Warnings lead the digest. A warning that restates a plain chip takes its place and keeps the chip's fuller tooltip.
export function withWarnings(items: readonly DigestItem[], warnings: readonly DigestItem[]): DigestItem[] {
  const restated = new Map(items.map((item) => [item.id, item]));
  const leading = warnings.map((warning) => ({ ...warning, detail: restated.get(warning.id)?.detail ?? warning.detail }));
  const warningIds = new Set(warnings.map((warning) => warning.id));
  return [...leading, ...items.filter((item) => !warningIds.has(item.id))];
}

export interface DigestRow {
  readonly warnings: readonly DigestItem[];
  readonly counts: readonly DigestItem[];
}

// Warnings are placed before plain counts and never give way to "+N more" (see digestLayout).
export function splitDigestRow(items: readonly DigestItem[]): DigestRow {
  return { warnings: items.filter((item) => item.isWarning === true), counts: items.filter((item) => item.isWarning !== true) };
}

// The server's review resolutions, in the order a ready-to-ship summary reads them.
export const FINDING_RESOLUTIONS = ['fixed', 'false_positive', 'out_of_scope', 'open'] as const;
export type FindingResolution = typeof FINDING_RESOLUTIONS[number];
export type FindingsTally = Readonly<Record<FindingResolution, number>>;

function isFindingResolution(resolution: string | null): resolution is FindingResolution {
  return FINDING_RESOLUTIONS.includes(resolution as FindingResolution);
}

// Review threads by the resolution the server recorded; replies and unclassified threads are not findings.
export function findingsTally(comments: Readonly<Record<string, readonly ReviewComment[]>>): FindingsTally {
  const tally: Record<FindingResolution, number> = { fixed: 0, false_positive: 0, out_of_scope: 0, open: 0 };
  for (const comment of Object.values(comments).flat()) {
    if (comment.scope === REVIEW_SCOPE && comment.parent_id === null && isFindingResolution(comment.resolution)) {
      tally[comment.resolution] += 1;
    }
  }
  return tally;
}

export function presentFindings(tally: FindingsTally): FindingResolution[] {
  return FINDING_RESOLUTIONS.filter((resolution) => tally[resolution] > 0);
}

// A digest value still loading reads "…"; one that failed reads "—", and its own tab shows the error.
export function resourceValue<T>(resource: Resource<T>, select: (data: T) => string | number): string {
  if (resource.data !== undefined) {
    return String(select(resource.data));
  }
  return resource.error === undefined ? LOADING_VALUE : UNAVAILABLE_VALUE;
}
