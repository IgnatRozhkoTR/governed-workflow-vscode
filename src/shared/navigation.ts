import type { ReviewComment, WorkspaceState } from '../api/types';
import { CODE_COMMENT_SCOPE, isApprovalBlocker } from '../comments/commentMapping';
import { isPlanAwaitingApproval } from './planStage';

export type TabId = 'preplanning' | 'planning' | 'research' | 'phase' | 'changes' | 'review'
                  | 'progress' | 'reflection' | 'scratchpads' | 'settings';
export type SettingsSectionId = 'task' | 'workflow' | 'phases' | 'reviewMode' | 'verification'
                  | 'rules' | 'git' | 'claude' | 'system';
export type Topic = 'comments' | 'context' | 'criteria' | 'proposals' | 'scratchpads' | 'diff' | 'history'
                  | 'verification' | 'reviewPipeline' | 'reviewThreads' | 'git' | 'settings' | 'rules' | 'phases';
export type PanelAction = 'setPhase' | 'rejectPlan' | 'approvePlan';

export interface CommentRef {
  readonly scope: string;
  readonly target: string;
}

export interface NavTarget {
  readonly tab: TabId;
  readonly section?: SettingsSectionId | string;
  readonly anchor?: string;
  readonly action?: PanelAction;
  readonly comment?: CommentRef;
}

export const TAB_ORDER: readonly TabId[] =
  ['preplanning', 'planning', 'research', 'phase', 'changes', 'review', 'progress', 'reflection', 'scratchpads', 'settings'];

export const TOPICS: readonly Topic[] = [
  'comments', 'context', 'criteria', 'proposals', 'scratchpads', 'diff', 'history',
  'verification', 'reviewPipeline', 'reviewThreads', 'git', 'settings', 'rules', 'phases',
];

// With nothing waiting on the user, a workspace opens on how the ticket is progressing rather than on its settings.
export const DEFAULT_NAV: NavTarget = { tab: 'progress' };

export const TICKET_NAME_ANCHOR = 'ticket-name';
// A new workspace has no ticket yet, so it opens on the task section with the ticket name ready to type.
export const NEW_WORKSPACE_NAV: NavTarget = { tab: 'settings', section: 'task', anchor: TICKET_NAME_ANCHOR };

export const PLAN_APPROVAL_NAV: NavTarget = { tab: 'planning', anchor: 'plan-execution' };
// The Review tab's blocking-threads banner; arriving there expands its list.
export const REVIEW_BLOCKING_NAV: NavTarget = { tab: 'review', anchor: 'review-blocking' };
export const SHIP_SUMMARY_NAV: NavTarget = { tab: 'progress', anchor: 'ship-summary' };

const PREPLANNING_GATE_PHASE = '1.4';
const PLAN_GATE_PHASES: ReadonlySet<string> = new Set(['2.0', '2.1']);
const FINAL_APPROVAL_GATE_PHASE = '4.2';
const CODE_REVIEW_GATE_PATTERN = /^3\.\d+\.3$/;

export function isFinalApprovalGate(phase: string): boolean {
  return phase === FINAL_APPROVAL_GATE_PHASE;
}

export function isCodeReviewGate(phase: string): boolean {
  return CODE_REVIEW_GATE_PATTERN.test(phase);
}

// Counted with the server's approve guard rule, so a gate lands on Review exactly when the gate would refuse approval.
export function blockingThreadCount(comments: Readonly<Record<string, readonly ReviewComment[]>>): number {
  return Object.values(comments).flat().filter((comment) => comment.scope === CODE_COMMENT_SCOPE && isApprovalBlocker(comment)).length;
}

// Each gate lands where its decision material is: the pre-planning status, the plan, the threads that block a commit
// (or the diff when none do), and the ready-to-ship summary before the ticket is finished.
export function pendingGateNav(gatePhase: string, blockingThreads: number): NavTarget {
  if (gatePhase === PREPLANNING_GATE_PHASE) {
    return { tab: 'preplanning', anchor: 'preplanning-approval' };
  }
  if (PLAN_GATE_PHASES.has(gatePhase)) {
    return PLAN_APPROVAL_NAV;
  }
  if (isCodeReviewGate(gatePhase)) {
    return blockingThreads > 0 ? REVIEW_BLOCKING_NAV : { tab: 'changes' };
  }
  return isFinalApprovalGate(gatePhase) ? SHIP_SUMMARY_NAV : { tab: 'phase', anchor: 'phase-progression' };
}

export const REFLECTION_PROPOSALS_NAV: NavTarget = { tab: 'reflection', anchor: 'reflection-proposals' };
const TICKET_SUMMARY_NAV: NavTarget = { tab: 'progress', anchor: 'progress-summary' };

// Reflection (phase 5) is where the agent's improvement proposals wait for the user's apply/reject.
const REFLECTION_TOP_PHASE = 5;

export interface AttentionSignals {
  readonly pendingGatePhase: string | undefined;
  readonly blockingThreads: number;
  readonly isPlanAwaitingApproval: boolean;
  readonly hasProposalsAwaitingReview: boolean;
  readonly isTicketFinished: boolean;
}

// The server's phase sequence ends with the terminal phase, so reaching it means the ticket is finished.
export function isFinalPhase(phase: string, phaseSequence: readonly string[]): boolean {
  return phaseSequence.length > 0 && phaseSequence[phaseSequence.length - 1] === phase;
}

export function isReflectionPhase(phase: string): boolean {
  return Number.parseInt(phase, 10) === REFLECTION_TOP_PHASE;
}

export function attentionSignals(state: WorkspaceState, pendingProposals: number): AttentionSignals {
  return {
    pendingGatePhase: state.pending_gate?.phase,
    blockingThreads: blockingThreadCount(state.comments),
    isPlanAwaitingApproval: isPlanAwaitingApproval(state.plan, state.phase, state.plan_status),
    hasProposalsAwaitingReview: pendingProposals > 0 && isReflectionPhase(state.phase),
    isTicketFinished: isFinalPhase(state.phase, state.phase_sequence),
  };
}

// Where the user is needed most, in priority order: a blocking gate, the plan decision, reflection proposals,
// then the summary of a finished ticket. Undefined means nothing waits, so the caller falls back to its own default.
export function needsAttentionNav(signals: AttentionSignals): NavTarget | undefined {
  if (signals.pendingGatePhase !== undefined) {
    return pendingGateNav(signals.pendingGatePhase, signals.blockingThreads);
  }
  if (signals.isPlanAwaitingApproval) {
    return PLAN_APPROVAL_NAV;
  }
  if (signals.hasProposalsAwaitingReview) {
    return REFLECTION_PROPOSALS_NAV;
  }
  return signals.isTicketFinished ? TICKET_SUMMARY_NAV : undefined;
}

export function isSameNav(a: NavTarget, b: NavTarget): boolean {
  return a.tab === b.tab && a.section === b.section && a.anchor === b.anchor && a.action === b.action
    && a.comment?.scope === b.comment?.scope && a.comment?.target === b.comment?.target;
}

const PANEL_ACTIONS: readonly PanelAction[] = ['setPhase', 'rejectPlan', 'approvePlan'];

export function isNavTarget(value: unknown): value is NavTarget {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return TAB_ORDER.includes(candidate.tab as TabId)
    && isOptionalString(candidate.section)
    && isOptionalString(candidate.anchor)
    && (candidate.action === undefined || PANEL_ACTIONS.includes(candidate.action as PanelAction))
    && (candidate.comment === undefined || isCommentRef(candidate.comment));
}

export function isCommentRef(value: unknown): value is CommentRef {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.scope === 'string' && candidate.scope !== '' && typeof candidate.target === 'string';
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}
