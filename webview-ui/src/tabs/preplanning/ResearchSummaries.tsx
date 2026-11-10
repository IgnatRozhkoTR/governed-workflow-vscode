import type { ResearchEntry } from '@api-types';
import type { JSX } from 'preact';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { useT } from '../../i18n/i18n';
import { capitalizeFirstLetter } from '../../lib/format';
import { useNav } from '../../store/hooks';
import { proofBadgeSpec } from '../research/findings';
import { InlineDiscussion } from './InlineDiscussion';

function ResearchSummaryCard({ entry }: { readonly entry: ResearchEntry }): JSX.Element {
  const t = useT();
  const [, navigate] = useNav();
  const badge = proofBadgeSpec(entry.proven);
  const open = (): void => navigate({ tab: 'research', anchor: `research-${entry.id}` });
  return (
    <InlineDiscussion
      scope="research"
      target={String(entry.id)}
      renderItem={(trigger) => (
        <div class="gw-pp-research-card">
          <div class="gw-pp-research-head">
            <button type="button" class="gw-pp-research-open" title={t('vsc.preplanning.openResearch')} onClick={open}>
              <span class="gw-pp-research-topic">{entry.topic || t('research.untitledResearch')}</span>
              <Icon name="arrow-right" />
            </button>
            <Badge label={capitalizeFirstLetter(t(badge.labelKey))} tone={badge.tone} />
            {trigger}
          </div>
          {entry.summary !== '' && <div class="gw-pp-research-summary">{entry.summary}</div>}
        </div>
      )}
    />
  );
}

export function ResearchSummaries({ research }: { readonly research: readonly ResearchEntry[] }): JSX.Element {
  const t = useT();
  return (
    <Card id="preplanning-research" persistKey="card.research-summaries" title={t('preplanning.researchSummaries')} badge={research.length > 0 ? <Badge label={String(research.length)} tone="neutral" /> : undefined}>
      {research.length === 0 ? (
        <EmptyState icon="beaker" message={t('preplanning.noResearch')} />
      ) : (
        <div class="gw-pp-list">{research.map((entry) => <ResearchSummaryCard key={entry.id} entry={entry} />)}</div>
      )}
    </Card>
  );
}
