import type { Plan, PlanStatus } from '@api-types';
import { isPlanPresent, planStageOf } from '@shared/planStage';
import type { JSX } from 'preact';
import { addComment, setPlanStatus } from '../api/core';
import { useT } from '../i18n/i18n';
import { useMutation, useStore } from '../store/hooks';
import { Badge } from './Badge';
import { Button } from './Button';
import { useDialogs, type ConfirmOptions, type DialogNotice } from './DialogHost';
import { createExclusiveLock, detach } from './exclusiveLock';
import { PLAN_TARGET } from '../tabs/planning/planTargets';
import { toasts } from './ToastHost';
import type { Codicon, Tone } from './types';

export interface PlanStatusBadgeProps {
  readonly planStatus: string | null;
}

export interface PlanApprovalBarProps extends PlanStatusBadgeProps {
  readonly approvalNotices?: readonly DialogNotice[];
  // A narrow bar says only "Send back"; the tooltip still says what that does.
  readonly isNarrow?: boolean;
}

export interface PlanStatusActions {
  readonly pending: boolean;
  readonly isSubmitting: boolean;
  setStatus(status: PlanStatus): Promise<void>;
  confirmAndSetStatus(status: PlanStatus, confirmation: ConfirmOptions): Promise<void>;
  approveWithConfirmation(notices?: readonly DialogNotice[]): Promise<void>;
  rejectWithFeedback(): Promise<void>;
}

interface StatusView {
  readonly badgeKey: string;
  readonly tone: Tone;
  readonly approve: { readonly labelKey: string; readonly icon: Codicon; readonly next: PlanStatus; readonly variant: 'primary' | 'secondary' };
  readonly reject: { readonly labelKey: string; readonly narrowLabelKey?: string; readonly titleKey?: string; readonly icon: Codicon; readonly next: PlanStatus; readonly variant: 'danger' | 'secondary' };
}

const PENDING_VIEW: StatusView = {
  badgeKey: 'vsc.planning.badgePending',
  tone: 'warning',
  approve: { labelKey: 'buttons.approve', icon: 'check', next: 'approved', variant: 'primary' },
  reject: { labelKey: 'vsc.gate.sendBackPlan', narrowLabelKey: 'vsc.gate.sendBack', titleKey: 'vsc.gate.sendBackPlanTitle', icon: 'close', next: 'rejected', variant: 'danger' },
};

const STATUS_VIEWS: Readonly<Record<string, StatusView>> = {
  approved: { ...PENDING_VIEW, badgeKey: 'vsc.planning.badgeApproved', tone: 'success', approve: { labelKey: 'buttons.revokeApproval', icon: 'discard', next: 'pending', variant: 'secondary' } },
  rejected: { ...PENDING_VIEW, badgeKey: 'vsc.planning.badgeRejected', tone: 'danger', reject: { labelKey: 'buttons.revokeRejection', icon: 'discard', next: 'pending', variant: 'secondary' } },
};

const STATUS_TOAST_KEYS: Readonly<Record<PlanStatus, string>> = {
  approved: 'vsc.planning.statusApproved',
  rejected: 'vsc.planning.statusRejected',
  pending: 'vsc.planning.statusPending',
};

const planStatusLock = createExclusiveLock();

export { isPlanPresent };

// Like the web's Phase Control card: once execution is over the plan decision is history, not an action.
// While an approved plan is being executed or reviewed, Revoke/Reject read as "reject the code", so they leave the decision bars;
// the Planning tab keeps a discreet revoke for that case.
export function isPlanDecisionOpen(plan: Plan | undefined, phase: string, planStatus: string | null): boolean {
  const stage = planStageOf(phase);
  if (!isPlanPresent(plan) || stage === 'post_execution') {
    return false;
  }
  return !(planStatus === 'approved' && stage === 'execution');
}

export function isApprovedPlanInExecution(plan: Plan | undefined, phase: string, planStatus: string | null): boolean {
  return isPlanPresent(plan) && planStatus === 'approved' && planStageOf(phase) === 'execution';
}

export function usePlanStatusActions(): PlanStatusActions {
  const t = useT();
  const dialogs = useDialogs();
  const isInFlight = planStatusLock.useIsHeld();
  const isSubmitting = planStatusLock.useIsSubmitting();
  const mutation = useMutation(async (status: PlanStatus, feedback?: string) => {
    if (feedback !== undefined && feedback.trim() !== '') {
      await addComment({ scope: 'plan', target: PLAN_TARGET, text: feedback.trim() });
    }
    await setPlanStatus(status);
    return status;
  }, { invalidates: ['comments'], refreshState: true });
  const applyStatus = async (status: PlanStatus, feedback?: string): Promise<void> => {
    if ((await mutation.run(status, feedback)) !== undefined) {
      toasts.success(t(STATUS_TOAST_KEYS[status]));
    }
  };
  const rejectWithFeedback = (): Promise<void> => planStatusLock.run(async (submit) => {
    const feedback = await dialogs.prompt({
      title: t('vsc.gate.sendBackPlan'),
      message: t('vsc.gate.sendBackPlanConfirm'),
      placeholder: t('vsc.gate.feedbackPlaceholder'),
      multiline: true,
      confirmLabel: t('vsc.gate.sendBackPlan'),
      danger: true,
    });
    if (feedback !== undefined) {
      await submit(() => applyStatus('rejected', feedback));
    }
  });
  const setStatus = (status: PlanStatus): Promise<void> => planStatusLock.run((submit) => submit(() => applyStatus(status)));
  const confirmAndSetStatus = (status: PlanStatus, confirmation: ConfirmOptions): Promise<void> => planStatusLock.run(async (submit) => {
    if (await dialogs.confirm(confirmation)) {
      await submit(() => applyStatus(status));
    }
  });
  // Approving lets the agent start implementing, so every entry point (bars, header, commands) asks the same question first.
  const approveWithConfirmation = (notices?: readonly DialogNotice[]): Promise<void> => confirmAndSetStatus('approved', {
    title: t('vsc.planning.approveConfirmTitle'),
    message: t('vsc.planning.approveConfirmMessage'),
    notices,
    confirmLabel: t('buttons.approve'),
  });
  return { pending: mutation.pending || isInFlight, isSubmitting, setStatus, confirmAndSetStatus, approveWithConfirmation, rejectWithFeedback };
}

export function PlanStatusBadge({ planStatus }: PlanStatusBadgeProps): JSX.Element {
  const t = useT();
  const view = statusView(planStatus);
  return <Badge label={t(view.badgeKey)} tone={view.tone} />;
}

export function PlanApprovalBar({ planStatus, approvalNotices, isNarrow = false }: PlanApprovalBarProps): JSX.Element {
  const t = useT();
  const actions = usePlanStatusActions();
  const isDecisionOpen = useStore((s) => isPlanDecisionOpen(s.state?.plan, s.state?.phase ?? '', planStatus));
  const view = statusView(planStatus);
  const rejectLabelKey = isNarrow ? view.reject.narrowLabelKey ?? view.reject.labelKey : view.reject.labelKey;
  const runReject = (): Promise<void> => (view.reject.next === 'rejected' ? actions.rejectWithFeedback() : actions.setStatus(view.reject.next));
  const runApprove = (): Promise<void> => (view.approve.next === 'approved' ? actions.approveWithConfirmation(approvalNotices) : actions.setStatus(view.approve.next));
  return (
    <div class="gw-plan-approval">
      <PlanStatusBadge planStatus={planStatus} />
      {isDecisionOpen && (
        <>
          <Button size="sm" variant={view.approve.variant} icon={view.approve.icon} label={t(view.approve.labelKey)} disabled={actions.isSubmitting} onClick={detach(runApprove)} />
          <Button size="sm" variant={view.reject.variant} icon={view.reject.icon} label={t(rejectLabelKey)} title={view.reject.titleKey === undefined ? undefined : t(view.reject.titleKey)} disabled={actions.isSubmitting} onClick={detach(runReject)} />
        </>
      )}
    </div>
  );
}

function statusView(planStatus: string | null): StatusView {
  return STATUS_VIEWS[planStatus ?? ''] ?? PENDING_VIEW;
}
