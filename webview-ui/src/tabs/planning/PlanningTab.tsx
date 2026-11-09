import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { PlanApprovalBar, usePlanStatusActions, useDialogs } from '../../components';
import { useT } from '../../i18n/i18n';
import { useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { ArchitectureCard } from './ArchitectureCard';
import { CriteriaCard } from './CriteriaCard';
import { ExecutionFlowCard } from './ExecutionFlowCard';
import { ExecutionPlanCard } from './ExecutionPlanCard';
import { ScopeCard } from './ScopeCard';

function usePlanNavigationAction(nav: TabProps['nav'], active: boolean): void {
  const t = useT();
  const dialogs = useDialogs();
  const actions = usePlanStatusActions();
  const handledNav = useRef(nav);
  useEffect(() => {
    if (!active || handledNav.current === nav || nav.action === undefined) {
      return;
    }
    handledNav.current = nav;
    if (nav.action === 'rejectPlan') {
      void actions.rejectWithFeedback();
    } else if (nav.action === 'approvePlan') {
      void dialogs
        .confirm({ title: t('vsc.planning.approveConfirmTitle'), message: t('vsc.planning.approveConfirmMessage'), confirmLabel: t('buttons.approve') })
        .then((isConfirmed) => (isConfirmed ? actions.setStatus('approved') : undefined));
    }
  }, [nav, active]);
}

export function PlanningTab({ active, nav }: TabProps): JSX.Element {
  const state = useWorkspaceState();
  usePlanNavigationAction(nav, active);
  const hasPlan = (state.plan.execution ?? []).length > 0 || (state.plan.description ?? '') !== '';
  return (
    <div class="gw-planning">
      {hasPlan && <div class="gw-planning-topbar"><PlanApprovalBar planStatus={state.plan_status} /></div>}
      <ArchitectureCard systemDiagram={state.plan.systemDiagram} />
      <ExecutionFlowCard plan={state.plan} />
      <ScopeCard scope={state.scope} plan={state.plan} section={nav.section} />
      <ExecutionPlanCard plan={state.plan} planStatus={state.plan_status} phase={state.phase} scope={state.scope} />
      <CriteriaCard active={active} />
    </div>
  );
}
