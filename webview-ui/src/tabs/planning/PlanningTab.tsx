import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Button, usePlanStatusActions } from '../../components';
import { isApprovedPlanInExecution } from '../../components/PlanApprovalBar';
import { useT } from '../../i18n/i18n';
import { usePlanReview, useWarningNotices } from '../../shell/GateDigest';
import { useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { ArchitectureCard } from './ArchitectureCard';
import { CriteriaCard } from './CriteriaCard';
import { ExecutionFlowCard } from './ExecutionFlowCard';
import { ExecutionPlanCard } from './ExecutionPlanCard';
import { ScopeCard } from './ScopeCard';

// Approving from a command asks the same question as the decision bar, warnings included, so it waits for them to load.
export function usePlanNavigationAction(nav: TabProps['nav'], active: boolean): void {
  const actions = usePlanStatusActions();
  const isApproveRequested = active && nav.action === 'approvePlan';
  const review = usePlanReview(isApproveRequested);
  const toNotices = useWarningNotices();
  const handledNav = useRef<TabProps['nav'] | undefined>(undefined);
  useEffect(() => {
    if (!active || handledNav.current === nav || nav.action === undefined || (isApproveRequested && !review.isSettled)) {
      return;
    }
    handledNav.current = nav;
    if (nav.action === 'rejectPlan') {
      void actions.rejectWithFeedback();
    } else if (nav.action === 'approvePlan') {
      void actions.approveWithConfirmation(toNotices(review.warnings));
    }
  }, [nav, active, review.isSettled]);
}

function RevokePlanApprovalButton(): JSX.Element {
  const t = useT();
  const actions = usePlanStatusActions();
  const revoke = (): Promise<void> => actions.confirmAndSetStatus('pending', {
    title: t('vsc.planning.revokeConfirmTitle'),
    message: t('vsc.planning.revokeConfirmMessage'),
    confirmLabel: t('vsc.planning.revokeApproval'),
    danger: true,
  });
  return <Button size="sm" variant="ghost" icon="discard" label={t('vsc.planning.revokeApproval')} disabled={actions.pending} onClick={revoke} />;
}

// The plan text and its sub-phases come first, then the acceptance criteria the plan is judged by; diagrams are
// supporting detail and start collapsed, like on the web.
// The plan decision itself lives in the shell's pinned decision bar.
export function PlanningTab({ active, nav }: TabProps): JSX.Element {
  const state = useWorkspaceState();
  usePlanNavigationAction(nav, active);
  const canRevokeQuietly = isApprovedPlanInExecution(state.plan, state.phase, state.plan_status);
  return (
    <div class="gw-planning">
      <ExecutionPlanCard plan={state.plan} phase={state.phase} scope={state.scope} secondaryAction={canRevokeQuietly ? <RevokePlanApprovalButton /> : undefined} />
      <CriteriaCard active={active} />
      <ScopeCard scope={state.scope} plan={state.plan} section={nav.section} />
      <ArchitectureCard systemDiagram={state.plan.systemDiagram} />
      <ExecutionFlowCard plan={state.plan} />
    </div>
  );
}
