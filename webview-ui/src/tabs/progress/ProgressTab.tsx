import type { ProgressEntry } from '@api-types';
import type { JSX } from 'preact';
import { Badge, Card, EmptyState, Markdown, StructuredValue, TimeAgo } from '../../components';
import { useT } from '../../i18n/i18n';
import { usePhaseLabel, useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { hasDetails, isCurrentProgressKey, normalizeDetails, orderProgressNewestFirst, summaryPreview, wasUpdatedAfterCreation } from './progressModel';
import { isFinalApprovalGate, isFinalPhase } from '@shared/navigation';
import { useStartClaude } from '../settings/sections/useStartClaude';
import { FixesStatusCard } from './FixesStatusCard';
import { isFixesPhase } from './fixesStatusModel';
import { ShipSummaryCard } from './ShipSummaryCard';
import { TicketSummaryCard } from './TicketSummaryCard';

const INITIAL_PHASE = '0';

export function ProgressTab(_props: TabProps): JSX.Element {
  const t = useT();
  const state = useWorkspaceState();
  const label = usePhaseLabel();
  const keys = orderProgressNewestFirst(state.progress ?? {}, state.phase_sequence);
  const gatePhase = state.pending_gate?.phase;
  const isShipping = gatePhase !== undefined && isFinalApprovalGate(gatePhase);
  return (
    <div class="gw-progress">
      {isShipping && <ShipSummaryCard />}
      {isFixesPhase(state.phase) && <FixesStatusCard />}
      {keys.length === 0 && <NoProgress phase={state.phase} />}
      {isFinalPhase(state.phase, state.phase_sequence) && <TicketSummaryCard state={state} />}
      {keys.map((key) => {
        const isCurrent = isCurrentProgressKey(key, state.phase);
        return (
          <Card
            key={`${key}:${isCurrent}`}
            id={`progress-${key}`}
            title={label(key)}
            badge={<ProgressBadges phaseKey={key} isCurrent={isCurrent} />}
            subtitle={<EntryTimes entry={state.progress[key] as ProgressEntry} />}
            collapsedPreview={summaryPreview((state.progress[key] as ProgressEntry).summary) || undefined}
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

function NoProgress({ phase }: { readonly phase: string }): JSX.Element {
  const t = useT();
  const startClaude = useStartClaude();
  if (phase !== INITIAL_PHASE) {
    return <EmptyState icon="pulse" message={t('vsc.progress.empty')} />;
  }
  return <EmptyState icon="pulse" message={t('vsc.progress.notStarted')} action={{ label: t('vsc.settings.startClaude'), onClick: () => void startClaude() }} />;
}

function ProgressBadges({ phaseKey, isCurrent }: { readonly phaseKey: string; readonly isCurrent: boolean }): JSX.Element {
  const t = useT();
  return (
    <>
      <Badge label={t('vsc.progress.phase', { phase: phaseKey })} tone="neutral" />
      {isCurrent && <Badge label={t('vsc.progress.current')} tone="warning" />}
    </>
  );
}

function EntryTimes({ entry }: { readonly entry: ProgressEntry }): JSX.Element {
  const t = useT();
  return (
    <span class="gw-progress-times">
      <span>{t('vsc.progress.created')} <TimeAgo iso={entry.created_at} /></span>
      {wasUpdatedAfterCreation(entry) && <span>{t('vsc.progress.updated')} <TimeAgo iso={entry.updated_at} /></span>}
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
