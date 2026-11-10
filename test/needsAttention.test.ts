import { describe, expect, it } from 'vitest';
import { attentionSignals, blockingThreadCount, isFinalPhase, needsAttentionNav, pendingGateNav, type AttentionSignals } from '../src/shared/navigation';
import { isPlanAwaitingApproval } from '../src/shared/planStage';
import { makeComment, makeState } from './support/fixtures';

const NOTHING: AttentionSignals = { pendingGatePhase: undefined, blockingThreads: 0, isPlanAwaitingApproval: false, hasProposalsAwaitingReview: false, isTicketFinished: false };
const EVERYTHING: AttentionSignals = { pendingGatePhase: '3.1.3', blockingThreads: 2, isPlanAwaitingApproval: true, hasProposalsAwaitingReview: true, isTicketFinished: true };
const PLAN = { description: 'Ship it', execution: [{ id: '3.1', name: 'Build', tasks: [] }] };

describe('needsAttentionNav', () => {
  it('needsAttentionNav_shouldPreferPendingGate_overEverythingElse', () => {
    expect(needsAttentionNav(EVERYTHING)).toEqual({ tab: 'review', anchor: 'review-blocking' });
    expect(needsAttentionNav({ ...NOTHING, pendingGatePhase: '1.4' })).toEqual({ tab: 'preplanning', anchor: 'preplanning-approval' });
  });

  it('needsAttentionNav_shouldPickPlan_thenReflection_thenTicketSummary_inPriorityOrder', () => {
    expect(needsAttentionNav({ ...EVERYTHING, pendingGatePhase: undefined })).toEqual({ tab: 'planning', anchor: 'plan-execution' });
    expect(needsAttentionNav({ ...NOTHING, hasProposalsAwaitingReview: true, isTicketFinished: true })).toEqual({ tab: 'reflection', anchor: 'reflection-proposals' });
    expect(needsAttentionNav({ ...NOTHING, isTicketFinished: true })).toEqual({ tab: 'progress', anchor: 'progress-summary' });
  });

  it('needsAttentionNav_shouldBeUndefined_whenNothingWaits', () => {
    expect(needsAttentionNav(NOTHING)).toBeUndefined();
  });
});

describe('pendingGateNav', () => {
  it('pendingGateNav_shouldLandOnBlockingThreads_whenCodeReviewGateHasBlockers', () => {
    expect(pendingGateNav('3.2.3', 1)).toEqual({ tab: 'review', anchor: 'review-blocking' });
  });

  it('pendingGateNav_shouldLandOnCodeChanges_whenCodeReviewGateHasNoBlockers', () => {
    expect(pendingGateNav('3.2.3', 0)).toEqual({ tab: 'changes' });
  });

  it('pendingGateNav_shouldLandOnShipSummary_whenFinalApprovalWaits', () => {
    expect(pendingGateNav('4.2', 3)).toEqual({ tab: 'progress', anchor: 'ship-summary' });
  });

  it('pendingGateNav_shouldLandOnPreplanningStatusAndPlanning_forEarlierGates', () => {
    expect(pendingGateNav('1.4', 0)).toEqual({ tab: 'preplanning', anchor: 'preplanning-approval' });
    expect(pendingGateNav('2.0', 0)).toEqual({ tab: 'planning', anchor: 'plan-execution' });
    expect(pendingGateNav('2.1', 0)).toEqual({ tab: 'planning', anchor: 'plan-execution' });
  });

  it('pendingGateNav_shouldFallBackToPhaseProgression_forUnknownGate', () => {
    expect(pendingGateNav('9.9', 0)).toEqual({ tab: 'phase', anchor: 'phase-progression' });
  });
});

describe('blockingThreadCount', () => {
  it('blockingThreadCount_shouldCountOpenReviewRootsOnly', () => {
    const comments = {
      'a.py': [
        makeComment({ id: 1, scope: 'review', resolution: 'open' }),
        makeComment({ id: 2, scope: 'review', resolution: 'open', resolved: true }),
        makeComment({ id: 3, scope: 'review', resolution: 'fixed' }),
        makeComment({ id: 4, scope: 'review', resolution: 'open', parent_id: 1 }),
        makeComment({ id: 5, scope: 'plan', resolution: 'open' }),
      ],
    };

    expect(blockingThreadCount(comments)).toBe(2);
  });
});

describe('attentionSignals', () => {
  it('attentionSignals_shouldReadGateAndPendingPlan_fromState', () => {
    const signals = attentionSignals(makeState({ phase: '2.0', plan: PLAN, plan_status: 'pending', pending_gate: { phase: '2.1', accepts_commit_message: false } }), 0);

    expect(signals).toEqual({ pendingGatePhase: '2.1', blockingThreads: 0, isPlanAwaitingApproval: true, hasProposalsAwaitingReview: false, isTicketFinished: false });
  });

  it('attentionSignals_shouldCountProposalsOnlyInReflectionPhase', () => {
    expect(attentionSignals(makeState({ phase: '5.1' }), 2).hasProposalsAwaitingReview).toBe(true);
    expect(attentionSignals(makeState({ phase: '5.1' }), 0).hasProposalsAwaitingReview).toBe(false);
    expect(attentionSignals(makeState({ phase: '3.1' }), 2).hasProposalsAwaitingReview).toBe(false);
  });

  it('attentionSignals_shouldMarkTicketFinished_whenAtLastPhaseOfSequence', () => {
    expect(attentionSignals(makeState({ phase: '6', phase_sequence: ['5.1', '6'] }), 0).isTicketFinished).toBe(true);
  });
});

describe('isFinalPhase', () => {
  it('isFinalPhase_shouldHoldOnlyForLastPhaseOfNonEmptySequence', () => {
    expect(isFinalPhase('6', ['5.1', '6'])).toBe(true);
    expect(isFinalPhase('5.1', ['5.1', '6'])).toBe(false);
    expect(isFinalPhase('6', [])).toBe(false);
  });
});

describe('isPlanAwaitingApproval', () => {
  it('isPlanAwaitingApproval_shouldHoldForUndecidedPlanInPlanningStageOnly', () => {
    expect(isPlanAwaitingApproval(PLAN, '2.0', 'pending')).toBe(true);
    expect(isPlanAwaitingApproval(PLAN, '2.1', null)).toBe(true);
    expect(isPlanAwaitingApproval(PLAN, '2.1', 'approved')).toBe(false);
    expect(isPlanAwaitingApproval(PLAN, '3.1', 'pending')).toBe(false);
    expect(isPlanAwaitingApproval({}, '2.0', 'pending')).toBe(false);
  });
});
