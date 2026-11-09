import type { ResearchEntry } from '@api-types';
import type { JSX } from 'preact';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { useT } from '../../i18n/i18n';
import { useNav } from '../../store/hooks';
import { proofBadgeSpec } from '../research/findings';
import { InlineDiscussion } from './InlineDiscussion';

function ResearchSummaryCard({ entry }: { readonly entry: ResearchEntry }): JSX.Element {
  const t = useT();
  const [, navigate] = useNav();
  const badge = proofBadgeSpec(entry.proven);
  const open = (): void => navigate({ tab: 'research', anchor: `research-${entry.id}` });
  return (
    <InlineDiscussion scope="research" target={String(entry.id)}>
      <div
        class="gw-pp-research-card"
        role="button"
        tabIndex={0}
        title={t('vsc.preplanning.openResearch')}
        onClick={open}
        onKeyDown={(event) => event.key === 'Enter' && open()}
      >
        <div class="gw-pp-research-head">
          <span class="gw-pp-research-topic">{entry.topic || t('research.untitledResearch')}</span>
          <Badge label={t(badge.labelKey)} tone={badge.tone} />
        </div>
        {entry.summary !== '' && <div class="gw-pp-research-summary">{entry.summary}</div>}
      </div>
    </InlineDiscussion>
  );
}

export function ResearchSummaries({ research, pendingDiscussions }: { readonly research: readonly ResearchEntry[]; readonly pendingDiscussions: number }): JSX.Element {
  const t = useT();
  return (
    <Card
      title={t('preplanning.researchSummaries')}
      badge={pendingDiscussions > 0 ? <Badge label={t('badges.researchCount', { count: pendingDiscussions })} tone="warning" /> : undefined}
    >
      {research.length === 0 ? (
        <EmptyState icon="beaker" message={t('preplanning.noResearch')} />
      ) : (
        <div class="gw-pp-list">{research.map((entry) => <ResearchSummaryCard key={entry.id} entry={entry} />)}</div>
      )}
    </Card>
  );
}
