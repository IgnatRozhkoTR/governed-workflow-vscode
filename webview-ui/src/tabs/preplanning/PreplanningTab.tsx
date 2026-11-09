import type { JSX } from 'preact';
import { GateActions } from '../../components/GateActions';
import { Card } from '../../components/Card';
import { useT } from '../../i18n/i18n';
import { useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { countPendingResearchDiscussions, provenDiscussionIds } from './discussionLogic';
import { Discussions } from './Discussions';
import { ImpactAnalysis } from './ImpactAnalysis';
import { ResearchSummaries } from './ResearchSummaries';

const PREPLANNING_GATE_PHASE = '1.4';

export function PreplanningTab({ nav }: TabProps): JSX.Element {
  const t = useT();
  const state = useWorkspaceState();
  const discussions = state.discussions ?? [];
  const research = state.research ?? [];
  const pendingResearch = countPendingResearchDiscussions(discussions, provenDiscussionIds(research));
  const gate = state.pending_gate?.phase === PREPLANNING_GATE_PHASE ? state.pending_gate : null;
  return (
    <div class="gw-pp">
      <ResearchSummaries research={research} pendingDiscussions={pendingResearch} />
      <ImpactAnalysis analysis={state.impact_analysis} />
      <Discussions discussions={discussions} research={research} nav={nav} />
      {gate !== null && (
        <Card title={t('preplanning.preplanningApproval')}>
          <p class="gw-pp-gate-description">{t('preplanning.approvalDescription')}</p>
          <GateActions gate={gate} />
        </Card>
      )}
    </div>
  );
}
