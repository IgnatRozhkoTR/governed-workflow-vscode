import type { PendingGate } from '@api-types';
import type { JSX } from 'preact';
import { GateActions } from '../../components/GateActions';
import { Card } from '../../components/Card';
import { classNames } from '../../components/types';
import { useAnchorTarget } from '../../components/useAnchor';
import { useT } from '../../i18n/i18n';
import { useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { Discussions } from './Discussions';
import { ImpactAnalysis } from './ImpactAnalysis';
import { ResearchSummaries } from './ResearchSummaries';
import { TicketContext } from './TicketContext';

const PREPLANNING_GATE_PHASE = '1.4';
// "What needs me" and the decision bar link here, so the anchor marks the top of the page rather than the feedback card below the evidence.
const GATE_STATUS_ANCHOR = 'preplanning-approval';

// The decision bar's chips already count research, impact and discussions, so the page only names the review.
function PreplanningStatusLine(): JSX.Element {
  const t = useT();
  const [ref, isHighlighted] = useAnchorTarget<HTMLElement>(GATE_STATUS_ANCHOR);
  return (
    <section id={GATE_STATUS_ANCHOR} ref={ref} class={classNames('gw-pp-status gw-anchor-target', isHighlighted && 'gw-card-highlight')}>
      <h2 class="gw-pp-heading">{t('phaseAction.preplanningReview')}</h2>
    </section>
  );
}

function PreplanningGateCard({ gate }: { readonly gate: PendingGate }): JSX.Element {
  const t = useT();
  return (
    <Card id="preplanning-approval-feedback" framed title={t('preplanning.preplanningApproval')}>
      <p class="gw-pp-gate-description">{t('phaseAction.preplanningReviewDesc')}</p>
      <GateActions gate={gate} />
    </Card>
  );
}

// The decision lives in the pinned bar, so the page reads top-down as evidence: status, ticket, research, impact, discussions, then the gate's feedback card.
export function PreplanningTab({ active }: TabProps): JSX.Element {
  const state = useWorkspaceState();
  const research = state.research ?? [];
  const discussions = state.discussions ?? [];
  const gate = state.pending_gate?.phase === PREPLANNING_GATE_PHASE ? state.pending_gate : null;
  return (
    <div class="gw-pp">
      {gate !== null && <PreplanningStatusLine />}
      <TicketContext active={active} />
      <ResearchSummaries research={research} />
      <ImpactAnalysis analysis={state.impact_analysis} />
      <Discussions discussions={discussions} research={research} />
      {gate !== null && <PreplanningGateCard gate={gate} />}
    </div>
  );
}
