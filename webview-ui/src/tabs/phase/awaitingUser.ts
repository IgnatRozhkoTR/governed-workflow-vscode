import type { AttentionSignals } from '@shared/navigation';

export function isAwaitingUser(signals: AttentionSignals): boolean {
  return signals.pendingGatePhase !== undefined || signals.isPlanAwaitingApproval || signals.hasProposalsAwaitingReview;
}
