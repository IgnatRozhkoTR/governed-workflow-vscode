import type { JSX } from 'preact';
import { listProposals, type Proposal } from '../../api/reflection';
import { Button, Icon, ResourceView, Toolbar } from '../../components';
import type { EmptyStateAction } from '../../components/EmptyState';
import { classNames } from '../../components/types';
import { useAnchorTarget } from '../../components/useAnchor';
import { useT } from '../../i18n/i18n';
import { usePersistentState, useResource, useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { ProposalCard } from './ProposalCard';
import { countHiddenResolved, isEveryProposalHandled, proposalProgress, visibleProposals } from './proposalsModel';

// Reflection is not a user gate: the agent advances on its own once the proposals are dealt with, so the tab states that instead of offering an action.
const REFLECTION_PHASE = '5.1';
const PROPOSALS_ANCHOR = 'reflection-proposals';

function useEmptyMessage(proposals: readonly Proposal[], showResolved: boolean, revealResolved: () => void): string | { readonly message: string; readonly action: EmptyStateAction } {
  const t = useT();
  const hiddenCount = countHiddenResolved(proposals, showResolved);
  if (hiddenCount === 0) {
    return t('proposals.empty');
  }
  return { message: t('vsc.reflection.noPending'), action: { label: t('vsc.reflection.showResolved', { count: hiddenCount }), onClick: revealResolved } };
}

function ReflectionProgress({ proposals }: { readonly proposals: readonly Proposal[] }): JSX.Element | null {
  const t = useT();
  const isReflecting = useWorkspaceState().phase === REFLECTION_PHASE;
  const progress = proposalProgress(proposals);
  if (progress.total === 0) {
    return null;
  }
  const isDone = isEveryProposalHandled(progress);
  const doneKey = isReflecting ? 'vsc.reflection.allHandledFinishing' : 'vsc.reflection.allHandled';
  return (
    <div class={classNames('gw-reflection-progress', isDone && 'gw-reflection-progress-done')} role="status">
      <Icon name={isDone ? 'pass' : 'tasklist'} />
      <span>{t(isDone ? doneKey : 'vsc.reflection.progress', { ...progress })}</span>
    </div>
  );
}

export function ReflectionTab({ active }: TabProps): JSX.Element {
  const t = useT();
  const [showResolved, setShowResolved] = usePersistentState('reflection.showResolved', false);
  const proposals = useResource('proposals', 'list', () => listProposals(), { active });
  const allProposals = proposals.data?.proposals ?? [];
  const emptyMessage = useEmptyMessage(allProposals, showResolved, () => setShowResolved(true));
  const [anchorRef, isHighlighted] = useAnchorTarget<HTMLElement>(PROPOSALS_ANCHOR);
  return (
    <div class="gw-reflection">
      <Toolbar align="end">
        <Button variant="ghost" icon={showResolved ? 'eye-closed' : 'eye'} label={t(showResolved ? 'proposals.hideResolved' : 'proposals.showResolved')} onClick={() => setShowResolved(!showResolved)} />
      </Toolbar>
      <section id={PROPOSALS_ANCHOR} ref={anchorRef} class={classNames('gw-reflection-proposals gw-anchor-target', isHighlighted && 'gw-card-highlight')}>
        <ReflectionProgress proposals={allProposals} />
        <ResourceView resource={proposals} empty={(data) => visibleProposals(data.proposals, showResolved).length === 0} emptyMessage={emptyMessage}>
          {(data) => (
            <div class="gw-reflection-list">
              {visibleProposals(data.proposals, showResolved).map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)}
            </div>
          )}
        </ResourceView>
      </section>
    </div>
  );
}
