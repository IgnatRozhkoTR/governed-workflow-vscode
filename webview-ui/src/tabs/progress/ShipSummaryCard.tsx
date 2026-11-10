import { SHIP_SUMMARY_NAV, blockingThreadCount } from '@shared/navigation';
import type { JSX } from 'preact';
import { Card, KeyValueList } from '../../components';
import { useT } from '../../i18n/i18n';
import { useBranchCommitCount, useChangedFileCount, useFindingsTally, useVerificationStatus } from '../../shell/branchFacts';
import { findingsSummary } from '../../shell/GateDigest';
import { resourceValue } from '../../shell/gateDigestModel';
import { useWorkspaceState } from '../../store/hooks';
import { runStatusLabel } from '../phase/statusLabel';

// What the final approval ships, in one place: the final gate lands here.
export function ShipSummaryCard(): JSX.Element {
  const t = useT();
  const { comments } = useWorkspaceState();
  const items = [
    { label: t('vsc.ship.commits'), value: resourceValue(useBranchCommitCount(), (count) => count) },
    { label: t('vsc.ship.files'), value: resourceValue(useChangedFileCount(), (count) => count) },
    { label: t('vsc.ship.findings'), value: findingsSummary(t, useFindingsTally()) },
    { label: t('vsc.ship.verification'), value: resourceValue(useVerificationStatus(), (status) => runStatusLabel(t, status)) },
    { label: t('vsc.ship.blockingThreads'), value: String(blockingThreadCount(comments)) },
  ];
  return (
    <Card id={SHIP_SUMMARY_NAV.anchor} framed title={t('vsc.ship.title')} collapsible={false}>
      <KeyValueList items={items} />
    </Card>
  );
}
