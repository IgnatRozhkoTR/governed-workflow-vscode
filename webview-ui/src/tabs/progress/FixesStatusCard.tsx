import type { JSX } from 'preact';
import { getVerificationResults, isVerificationRun } from '../../api/verification';
import { Badge, Card, KeyValueList } from '../../components';
import { useT } from '../../i18n/i18n';
import { useFindingsTally } from '../../shell/branchFacts';
import { useNav, useResource } from '../../store/hooks';
import { runStatusLabel } from '../phase/statusLabel';
import { findingsToAddress, findingsTone, verificationTone } from './fixesStatusModel';

function useLastRunStatus(): string | undefined {
  const results = useResource('verification', 'digest.results', () => getVerificationResults());
  return results.data !== undefined && isVerificationRun(results.data) ? results.data.status : undefined;
}

export function FixesStatusCard(): JSX.Element {
  const t = useT();
  const [, navigate] = useNav();
  const openFindings = findingsToAddress(useFindingsTally());
  const status = useLastRunStatus();
  const items = [
    {
      label: t('vsc.fixes.findings'),
      value: (
        <button type="button" class="gw-link" onClick={() => navigate({ tab: 'review' })}>
          <Badge label={t('vsc.fixes.findingsOpen', { count: openFindings })} tone={findingsTone(openFindings)} />
        </button>
      ),
    },
    {
      label: t('vsc.fixes.verification'),
      value: (
        <button type="button" class="gw-link" onClick={() => navigate({ tab: 'phase', anchor: 'verification-results' })}>
          <Badge label={status === undefined ? t('vsc.digest.verificationNone') : runStatusLabel(t, status)} tone={verificationTone(status)} />
        </button>
      ),
    },
  ];
  return (
    <Card id="fixes-status" framed title={t('vsc.fixes.title')} collapsible={false}>
      <KeyValueList items={items} />
    </Card>
  );
}
