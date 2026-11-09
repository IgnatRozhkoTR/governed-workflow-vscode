import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Card, Collapsible, IconButton, SetPhaseDialog } from '../../components';
import { useT } from '../../i18n/i18n';
import { usePhaseLabel, useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { ApprovalCard } from './ApprovalCard';
import { GateCard } from './GateCard';
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
  const editButton = <IconButton icon="edit" title={t('phase.overrideTitle')} onClick={() => setSetPhaseOpen(true)} />;
  return (
    <div class="gw-phase">
      <Card id="phase-progression" title={t('cards.phaseProgression')} subtitle={`${state.phase} · ${labelOf(state.phase)}`} actions={editButton}>
        <PhaseBar />
        <Collapsible summary={t('vsc.phase.history')} persistKey="phase.history">
          <PhaseHistory history={state.phaseHistory} />
        </Collapsible>
      </Card>
      <GateCard gate={state.pending_gate} phase={state.phase} />
      <ApprovalCard />
      <VerificationResultsCard active={active} />
      <ReviewPipelineCard active={active} />
      <SessionsCard sessions={state.sessions} activeSessionId={state.session_id} />
      <SetPhaseDialog open={isSetPhaseOpen} onClose={() => setSetPhaseOpen(false)} />
    </div>
  );
}
