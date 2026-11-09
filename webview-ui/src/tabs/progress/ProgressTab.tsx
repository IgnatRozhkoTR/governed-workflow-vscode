import type { ProgressEntry } from '@api-types';
import type { JSX } from 'preact';
import { Badge, Card, EmptyState, Markdown, StructuredValue, TimeAgo } from '../../components';
import { useT } from '../../i18n/i18n';
import { usePhaseLabel, useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { hasDetails, isCurrentProgressKey, normalizeDetails, orderProgressKeys } from './progressModel';

export function ProgressTab(_props: TabProps): JSX.Element {
  const t = useT();
  const state = useWorkspaceState();
  const label = usePhaseLabel();
  const keys = orderProgressKeys(state.progress ?? {}, state.phase_sequence);
  if (keys.length === 0) {
    return <EmptyState icon="pulse" message={t('vsc.progress.empty')} />;
  }
  return (
    <div class="gw-progress">
      {keys.map((key) => {
        const isCurrent = isCurrentProgressKey(key, state.phase);
        return (
          <Card
            key={`${key}:${isCurrent}`}
            id={`progress-${key}`}
            title={label(key)}
            badge={isCurrent ? <Badge label={t('vsc.progress.current')} tone="warning" /> : undefined}
            subtitle={<EntryTimes entry={state.progress[key] as ProgressEntry} />}
            collapsible
            defaultCollapsed={!isCurrent}
            persistKey={`progress-${key}`}
          >
            <EntryBody entry={state.progress[key] as ProgressEntry} />
          </Card>
        );
      })}
    </div>
  );
}

function EntryTimes({ entry }: { readonly entry: ProgressEntry }): JSX.Element {
  const t = useT();
  return (
    <span class="gw-progress-times">
      <span>{t('vsc.progress.created')} <TimeAgo iso={entry.created_at} /></span>
      <span>{t('vsc.progress.updated')} <TimeAgo iso={entry.updated_at} /></span>
    </span>
  );
}

function EntryBody({ entry }: { readonly entry: ProgressEntry }): JSX.Element {
  const t = useT();
  const details = normalizeDetails(entry.details);
  return (
    <div class="gw-progress-body">
      <Markdown source={entry.summary} />
      {hasDetails(details) && (
        <section class="gw-progress-details">
          <h4 class="gw-progress-details-title">{t('vsc.progress.details')}</h4>
          <StructuredValue value={details} />
        </section>
      )}
    </div>
  );
}
