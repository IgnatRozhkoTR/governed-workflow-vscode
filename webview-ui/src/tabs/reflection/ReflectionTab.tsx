import type { JSX } from 'preact';
import { listProposals } from '../../api/reflection';
import { Button, ResourceView, Toolbar } from '../../components';
import { useT } from '../../i18n/i18n';
import { usePersistentState, useResource } from '../../store/hooks';
import type { TabProps } from '../types';
import { ProposalCard } from './ProposalCard';
import { visibleProposals } from './proposalsModel';

export function ReflectionTab({ active }: TabProps): JSX.Element {
  const t = useT();
  const [showResolved, setShowResolved] = usePersistentState('reflection.showResolved', false);
  const proposals = useResource('proposals', 'list', () => listProposals(), { active });
  return (
    <div class="gw-reflection">
      <Toolbar align="end">
        <Button variant="ghost" icon={showResolved ? 'eye-closed' : 'eye'} label={t(showResolved ? 'proposals.hideResolved' : 'proposals.showResolved')} onClick={() => setShowResolved(!showResolved)} />
      </Toolbar>
      <ResourceView resource={proposals} empty={(data) => visibleProposals(data.proposals, showResolved).length === 0} emptyMessage={t('proposals.empty')}>
        {(data) => (
          <div class="gw-reflection-list">
            {visibleProposals(data.proposals, showResolved).map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)}
          </div>
        )}
      </ResourceView>
    </div>
  );
}
