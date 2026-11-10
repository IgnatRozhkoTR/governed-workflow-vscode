import { attentionSignals } from '@shared/navigation';
import type { JSX } from 'preact';
import { useT } from '../../i18n/i18n';
import { useAttentionCounts } from '../../store/attention';
import { usePhaseLabel, useWorkspaceState } from '../../store/hooks';
import { isAwaitingUser } from './awaitingUser';

// A waiting decision is stated once, in the pinned decision bar, so Phase Control only speaks when nothing waits.
export function GateStatusLine(): JSX.Element | null {
  const t = useT();
  const labelOf = usePhaseLabel();
  const state = useWorkspaceState();
  const counts = useAttentionCounts();
  if (isAwaitingUser(attentionSignals(state, counts.pendingProposals))) {
    return null;
  }
  return <p class="gw-phase-gate-line">{t('phase.noActionRequired', { phase: state.phase, name: labelOf(state.phase) })}</p>;
}
