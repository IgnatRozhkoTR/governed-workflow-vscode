import type { JSX } from 'preact';
import { Button, Card } from '../../components';
import { PlanStatusBadge, isPlanPresent } from '../../components/PlanApprovalBar';
import { useT } from '../../i18n/i18n';
import { useNav, useWorkspaceState } from '../../store/hooks';

// The plan decision itself lives in the shell's pinned decision bar; this card only reports the status.
export function ApprovalCard(): JSX.Element {
  const t = useT();
  const { plan, plan_status: planStatus } = useWorkspaceState();
  const [, navigate] = useNav();
  return (
    <Card id="approval-status" title={t('cards.approvalStatus')}>
      <div class="gw-phase-approval">
        <span class="gw-field-label">{t('phase.planStatus')}</span>
        <PlanStatusBadge planStatus={planStatus} />
        {isPlanPresent(plan) && <Button size="sm" variant="ghost" icon="go-to-file" label={t('buttons.viewPlan')} onClick={() => navigate({ tab: 'planning' })} />}
      </div>
    </Card>
  );
}
