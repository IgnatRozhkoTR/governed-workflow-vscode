import type { PendingGate } from '@api-types';
import type { JSX } from 'preact';
import { Badge, Card, GateActions } from '../../components';
import { useT } from '../../i18n/i18n';
import { usePhaseLabel } from '../../store/hooks';

export function GateCard({ gate, phase }: { readonly gate: PendingGate | null; readonly phase: string }): JSX.Element {
  const t = useT();
  const labelOf = usePhaseLabel();
  if (gate === null) {
    return <p class="gw-muted">{t('phase.noActionRequired', { phase, name: labelOf(phase) })}</p>;
  }
  return (
    <Card id="phase-gate" title={t('vsc.phase.gateWaiting')} badge={<Badge label={gate.phase} tone="warning" icon="bell" />}>
      <GateActions gate={gate} />
    </Card>
  );
}
