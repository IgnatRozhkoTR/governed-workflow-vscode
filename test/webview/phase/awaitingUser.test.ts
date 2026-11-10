import type { AttentionSignals } from '@shared/navigation';
import { describe, expect, it } from 'vitest';
import { isAwaitingUser } from '../../../webview-ui/src/tabs/phase/awaitingUser';

const IDLE: AttentionSignals = {
  pendingGatePhase: undefined,
  blockingThreads: 0,
  isPlanAwaitingApproval: false,
  hasProposalsAwaitingReview: false,
  isTicketFinished: false,
};

describe('isAwaitingUser', () => {
  it('isAwaitingUser_shouldBeFalse_whenNothingWaits', () => {
    expect(isAwaitingUser(IDLE)).toBe(false);
    expect(isAwaitingUser({ ...IDLE, isTicketFinished: true })).toBe(false);
  });

  it('isAwaitingUser_shouldBeTrue_whenGatePlanOrProposalsWait', () => {
    expect(isAwaitingUser({ ...IDLE, pendingGatePhase: '1.4' })).toBe(true);
    expect(isAwaitingUser({ ...IDLE, isPlanAwaitingApproval: true })).toBe(true);
    expect(isAwaitingUser({ ...IDLE, hasProposalsAwaitingReview: true })).toBe(true);
  });
});
