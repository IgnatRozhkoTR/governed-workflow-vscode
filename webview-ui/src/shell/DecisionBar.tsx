import type { PendingGate } from '@api-types';
import { REFLECTION_PROPOSALS_NAV, isReflectionPhase, type NavTarget } from '@shared/navigation';
import { isPlanAwaitingApproval } from '@shared/planStage';
import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { listProposals } from '../api/reflection';
import { Icon, PlanApprovalBar, type DialogNotice } from '../components';
import { GateDecisionButtons, gateTitle } from '../components/GateActions';
import { isPlanDecisionOpen } from '../components/PlanApprovalBar';
import { pluralKey } from '../components/plural';
import { classNames } from '../components/types';
import { useT } from '../i18n/i18n';
import { useNav, usePhaseLabel, useResource, useWorkspaceState } from '../store/hooks';
import { countPending } from '../tabs/reflection/proposalsModel';
import { useDecisionFocusTarget } from './decisionFocus';
import { DigestView, GateDigestSource, useWarningNotices } from './GateDigest';
import { useHeaderDensity } from './layout';
import { useRememberedNavigate } from './useRememberedNavigate';

interface DecisionLink {
  readonly labelKey: string;
  readonly icon: string;
  readonly nav: NavTarget;
}

const PROPOSALS_LINK: DecisionLink = { labelKey: 'vsc.decision.reviewProposals', icon: 'lightbulb', nav: REFLECTION_PROPOSALS_NAV };

// Plan decisions are summarised like the planning step itself, whichever phase the plan is revisited in.
const PLAN_DIGEST_PHASE = '2.0';

// One pinned slot under the tabs for whatever decision waits: a user gate first, otherwise the plan, otherwise
// reflection proposals, which are not a gate and so only point at the material.
// It stays visible on every tab and is the only place that takes the decision, so the user can study the material
// anywhere and decide without scrolling back. Its digest chips are the way to the material. Below 600px the header
// already names the gate, so the bar drops its title and gives the actions' row to the chips.
export function DecisionBar(): JSX.Element | null {
  const state = useWorkspaceState();
  const [nav] = useNav();
  const gate = state.pending_gate ?? undefined;
  if (gate !== undefined) {
    return <GateDecisionBar gate={gate} />;
  }
  const isOnPlanning = nav.tab === 'planning';
  const isPlanShown = isPlanAwaitingApproval(state.plan, state.phase, state.plan_status)
    || (isOnPlanning && isPlanDecisionOpen(state.plan, state.phase, state.plan_status));
  if (isPlanShown) {
    return <PlanDecisionBar planStatus={state.plan_status} />;
  }
  return isReflectionPhase(state.phase) ? <ReflectionAttentionBar /> : null;
}

interface DecisionBarFrameProps {
  readonly label: string;
  readonly title: JSX.Element;
  readonly digestPhase: string;
  readonly renderActions: (approval: ApprovalNotices) => JSX.Element;
}

interface ApprovalNotices {
  readonly warnings: readonly DialogNotice[];
  readonly blockers: readonly DialogNotice[];
  readonly blockingCount: number;
  // Below 600px Send back drops its destination from the label (the tooltip and dialog keep it) so a warning fits beside it.
  readonly isNarrow: boolean;
}

function sumCounts(blockers: readonly { readonly count: number }[]): number {
  return blockers.reduce((total, blocker) => total + blocker.count, 0);
}

function DecisionBarFrame({ label, title, digestPhase, renderActions }: DecisionBarFrameProps): JSX.Element {
  const [barRef, density] = useHeaderDensity<HTMLDivElement>();
  const actionsRef = useRef<HTMLSpanElement>(null);
  const toNotices = useWarningNotices();
  useDecisionFocusTarget(actionsRef);
  return (
    <div ref={barRef} class={classNames('gw-decision-bar', `gw-decision-bar-${density}`)} role="region" aria-label={label}>
      <GateDigestSource phase={digestPhase}>
        {(digest) => {
          const actions = renderActions({ warnings: toNotices([...digest.warnings, ...(digest.approvalNotes ?? [])]), blockers: toNotices(digest.blockers), blockingCount: sumCounts(digest.blockers), isNarrow: density === 'overflow' });
          return <DigestView digest={digest} title={title} actions={<span ref={actionsRef} class="gw-decision-bar-actions">{actions}</span>} />;
        }}
      </GateDigestSource>
    </div>
  );
}

function GateDecisionBar({ gate }: { readonly gate: PendingGate }): JSX.Element {
  const t = useT();
  const labelOf = usePhaseLabel();
  const title = gateTitle(t, labelOf, gate.phase);
  const heading = (
    <span class="gw-decision-bar-title" title={`${gate.phase} · ${title}`}>
      <Icon name="bell" />
      <span class="gw-decision-bar-phase">{gate.phase}</span>
      <span class="gw-decision-bar-text">{title}</span>
    </span>
  );
  return (
    <DecisionBarFrame
      label={t('vsc.phase.gateWaiting')}
      title={heading}
      digestPhase={gate.phase}
      renderActions={({ warnings, blockers, blockingCount, isNarrow }) => <GateDecisionButtons gate={gate} approvalNotices={warnings} approvalBlockers={blockers} blockingCount={blockingCount} isNarrow={isNarrow} />}
    />
  );
}

function PlanDecisionBar({ planStatus }: { readonly planStatus: string | null }): JSX.Element {
  const t = useT();
  const heading = (
    <span class="gw-decision-bar-title" title={t('vsc.decision.planTitle')}>
      <Icon name="checklist" />
      <span class="gw-decision-bar-text">{t('vsc.decision.planTitle')}</span>
    </span>
  );
  return (
    <DecisionBarFrame
      label={t('vsc.decision.planTitle')}
      title={heading}
      digestPhase={PLAN_DIGEST_PHASE}
      renderActions={({ warnings, isNarrow }) => <PlanApprovalBar planStatus={planStatus} approvalNotices={warnings} isNarrow={isNarrow} />}
    />
  );
}

function ReflectionAttentionBar(): JSX.Element | null {
  const t = useT();
  const proposals = useResource('proposals', 'attention', listProposals);
  const count = countPending(proposals.data?.proposals ?? []);
  if (count === 0) {
    return null;
  }
  const title = t(pluralKey('vsc.decision.proposalsTitle', count), { count });
  return (
    <div class="gw-decision-bar gw-decision-bar-attention" role="region" aria-label={title}>
      <span class="gw-decision-bar-title" title={title}>
        <Icon name="lightbulb" />
        <span class="gw-decision-bar-text">{title}</span>
      </span>
      <span class="gw-decision-bar-actions">
        <DecisionLinks links={[PROPOSALS_LINK]} />
      </span>
    </div>
  );
}

function DecisionLinks({ links }: { readonly links: readonly DecisionLink[] }): JSX.Element {
  const t = useT();
  const navigate = useRememberedNavigate();
  return (
    <span class="gw-decision-bar-links">
      {links.map((link) => (
        <button type="button" key={link.labelKey} class="gw-link gw-decision-bar-link" onClick={() => navigate(link.nav)}>
          <Icon name={link.icon} />
          <span>{t(link.labelKey)}</span>
        </button>
      ))}
    </span>
  );
}
