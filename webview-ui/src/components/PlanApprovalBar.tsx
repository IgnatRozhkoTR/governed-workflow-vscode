import type { PlanStatus } from '@api-types';
import type { JSX } from 'preact';
import { addComment, setPlanStatus } from '../api/core';
import { useT } from '../i18n/i18n';
import { useMutation } from '../store/hooks';
import { Badge } from './Badge';
import { Button } from './Button';
import { useDialogs } from './DialogHost';
import type { Tone } from './types';

export interface PlanApprovalBarProps {
  readonly planStatus: string | null;
}

export interface PlanStatusActions {
  readonly pending: boolean;
  setStatus(status: PlanStatus): Promise<void>;
  rejectWithFeedback(): Promise<void>;
}

interface StatusView {
  readonly badgeKey: string;
  readonly tone: Tone;
  readonly approve: { readonly labelKey: string; readonly next: PlanStatus; readonly variant: 'primary' | 'secondary' };
  readonly reject: { readonly labelKey: string; readonly next: PlanStatus; readonly variant: 'danger' | 'secondary' };
}

const PENDING_VIEW: StatusView = {
  badgeKey: 'badges.pending',
  tone: 'warning',
  approve: { labelKey: 'buttons.approve', next: 'approved', variant: 'primary' },
  reject: { labelKey: 'buttons.reject', next: 'rejected', variant: 'danger' },
};

const STATUS_VIEWS: Readonly<Record<string, StatusView>> = {
  approved: { ...PENDING_VIEW, badgeKey: 'badges.approved', tone: 'success', approve: { labelKey: 'buttons.revokeApproval', next: 'pending', variant: 'secondary' } },
  rejected: { ...PENDING_VIEW, badgeKey: 'badges.rejected', tone: 'danger', reject: { labelKey: 'buttons.revokeRejection', next: 'pending', variant: 'secondary' } },
};

export function usePlanStatusActions(): PlanStatusActions {
  const t = useT();
  const dialogs = useDialogs();
  const mutation = useMutation(async (status: PlanStatus, feedback?: string) => {
    if (feedback !== undefined && feedback.trim() !== '') {
      await addComment({ scope: 'plan', target: t('plan.entirePlan'), text: feedback.trim() });
    }
    await setPlanStatus(status);
  }, { invalidates: ['comments'], refreshState: true });
  const rejectWithFeedback = async (): Promise<void> => {
    const feedback = await dialogs.prompt({
      title: t('buttons.reject'),
      message: t('dialog.feedbackForRejection'),
      placeholder: t('placeholders.feedbackForChanges'),
      multiline: true,
      confirmLabel: t('buttons.reject'),
    });
    if (feedback !== undefined) {
      await mutation.run('rejected', feedback);
    }
  };
  return { pending: mutation.pending, setStatus: async (status) => { await mutation.run(status); }, rejectWithFeedback };
}

export function PlanApprovalBar({ planStatus }: PlanApprovalBarProps): JSX.Element {
  const t = useT();
  const actions = usePlanStatusActions();
  const view = STATUS_VIEWS[planStatus ?? ''] ?? PENDING_VIEW;
  const runReject = (): Promise<void> => (view.reject.next === 'rejected' ? actions.rejectWithFeedback() : actions.setStatus(view.reject.next));
  return (
    <div class="gw-plan-approval">
      <Badge label={t(view.badgeKey)} tone={view.tone} />
      <Button size="sm" variant={view.approve.variant} label={t(view.approve.labelKey)} disabled={actions.pending} onClick={() => actions.setStatus(view.approve.next)} />
      <Button size="sm" variant={view.reject.variant} label={t(view.reject.labelKey)} disabled={actions.pending} onClick={runReject} />
    </div>
  );
}
