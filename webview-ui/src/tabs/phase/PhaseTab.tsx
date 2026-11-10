import { isFinalPhase } from '@shared/navigation';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button, Card, SetPhaseDialog } from '../../components';
import { useT } from '../../i18n/i18n';
import { usePhaseLabel, useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { ApprovalCard } from './ApprovalCard';
import { GateStatusLine } from './GateStatusLine';
import { PhaseBar } from './PhaseBar';
import { PhaseHistory } from './PhaseHistory';
import { ReviewPipelineCard } from './ReviewPipelineCard';
import { SessionsCard } from './SessionsCard';
import { VerificationResultsCard } from './VerificationResultsCard';

export function PhaseTab({ active }: TabProps): JSX.Element {
  const t = useT();
  const labelOf = usePhaseLabel();
  const state = useWorkspaceState();
  const [isSetPhaseOpen, setSetPhaseOpen] = useState(false);
  const editButton = <Button size="sm" icon="edit" label={t('buttons.setPhase')} title={t('phase.overrideTitle')} onClick={() => setSetPhaseOpen(true)} />;
  return (
    <div class="gw-phase">
      <Card id="phase-progression" title={t('cards.phaseProgression')} subtitle={`${state.phase} · ${labelOf(state.phase)}`} actions={editButton}>
        <PhaseBar />
        <GateStatusLine />
      </Card>
      <ApprovalCard />
      <div class="gw-phase-checks">
        <VerificationResultsCard active={active} />
        {/* A finished ticket has nothing left to review, so the pipeline and its Run action would only mislead. */}
        {!isFinalPhase(state.phase, state.phase_sequence) && <ReviewPipelineCard active={active} />}
      </div>
      <Card id="phase-history" title={t('vsc.phase.history')}>
        <PhaseHistory history={state.phaseHistory} />
      </Card>
      <SessionsCard sessions={state.sessions} activeSessionId={state.session_id} />
      <SetPhaseDialog open={isSetPhaseOpen} onClose={() => setSetPhaseOpen(false)} />
    </div>
  );
}
