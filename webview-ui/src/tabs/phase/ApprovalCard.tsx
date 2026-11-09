import type { JSX } from 'preact';
import { Button, Card, PlanApprovalBar } from '../../components';
import { useT } from '../../i18n/i18n';
import { useNav, useWorkspaceState } from '../../store/hooks';

export function ApprovalCard(): JSX.Element {
  const t = useT();
  const { plan_status: planStatus } = useWorkspaceState();
  const [, navigate] = useNav();
  return (
    <Card id="approval-status" title={t('cards.approvalStatus')}>
      <div class="gw-phase-approval">
        <span class="gw-field-label">{t('phase.planStatus')}</span>
        <PlanApprovalBar planStatus={planStatus} />
        <Button size="sm" variant="ghost" icon="go-to-file" label={t('buttons.viewPlan')} onClick={() => navigate({ tab: 'planning' })} />
      </div>
    </Card>
  );
}
