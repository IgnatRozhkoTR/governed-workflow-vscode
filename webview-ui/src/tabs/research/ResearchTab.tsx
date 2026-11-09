import type { ResearchEntry } from '@api-types';
import type { JSX } from 'preact';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { useT } from '../../i18n/i18n';
import { useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { ResearchEntryCard } from './ResearchEntryCard';

function ResearchStatus({ research }: { readonly research: readonly ResearchEntry[] }): JSX.Element {
  const t = useT();
  const verified = research.filter((entry) => entry.proven === 1).length;
  const rejected = research.filter((entry) => entry.proven === -1).length;
  const pending = research.length - verified - rejected;
  const params = { verified, total: research.length, rejected };
  const label = rejected > 0 ? t('research.verifiedRejectedCount', params) : t('research.verifiedCount', params);
  return <Badge label={label} tone={pending > 0 ? 'warning' : rejected > 0 ? 'danger' : 'success'} />;
}

export function ResearchTab({ nav }: TabProps): JSX.Element {
  const t = useT();
  const research = useWorkspaceState().research ?? [];
  if (research.length === 0) {
    return <EmptyState icon="beaker" message={t('research.noEntries')} />;
  }
  return (
    <div class="gw-research">
      <div class="gw-research-status"><ResearchStatus research={research} /></div>
      {research.map((entry) => (
        <ResearchEntryCard key={entry.id} entry={entry} isAnchored={nav.anchor === `research-${entry.id}`} />
      ))}
    </div>
  );
}
