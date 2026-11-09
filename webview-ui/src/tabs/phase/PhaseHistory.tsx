import type { PhaseTransition } from '@api-types';
import type { JSX } from 'preact';
import { EmptyState, Icon } from '../../components';
import { useT } from '../../i18n/i18n';
import { formatDate } from '../../lib/format';
import { usePhaseLabel } from '../../store/hooks';

export function PhaseHistory({ history }: { readonly history: readonly PhaseTransition[] }): JSX.Element {
  const t = useT();
  const labelOf = usePhaseLabel();
  if (history.length === 0) {
    return <EmptyState icon="history" message={t('phase.noChangesRecorded')} />;
  }
  return (
    <ol class="gw-phase-history">
      {[...history].reverse().map((entry, index) => (
        <li key={`${entry.time}-${index}`} class="gw-phase-history-entry">
          <span class="gw-phase-history-move" title={`${labelOf(entry.from)} → ${labelOf(entry.to)}`}>
            <code>{entry.from}</code>
            <Icon name="arrow-right" />
            <code>{entry.to}</code>
          </span>
          <span class="gw-muted">{formatDate(entry.time)}</span>
        </li>
      ))}
    </ol>
  );
}
