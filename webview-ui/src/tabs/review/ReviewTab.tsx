import type { ReviewComment } from '@api-types';
import type { ComponentChildren, JSX } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import { listRepos, type RepoEntry } from '../../api/changes';
import { listComments } from '../../api/core';
import { resolveAllReview, type ReviewResolution } from '../../api/review';
import { Badge, Button, EmptyState, Icon, Popover, ResourceView, Select, Toolbar, useDialogs } from '../../components';
import { classNames } from '../../components/types';
import { useAnchorTarget } from '../../components/useAnchor';
import { toasts } from '../../components/ToastHost';
import { pluralKey } from '../../components/plural';
import { useT } from '../../i18n/i18n';
import { capitalizeFirstLetter } from '../../lib/format';
import { REVIEW_SCOPE } from '../../lib/comments';
import { useMutation, usePersistentState, useResource, useStore, useWorkspaceState } from '../../store/hooks';
import { isFinalPhase } from '@shared/navigation';
import type { TabProps } from '../types';
import { ApprovalBlockers, REVIEW_BLOCKING_ANCHOR } from './ApprovalBlockers';
import { ReviewThreadItem } from './ReviewThreadItem';
import { blockingRoots, resolvedBlockingCount, unresolvedRootCount } from './reviewBlocking';
import { NO_RESOLUTION_CHOSEN, groupRoots, groupRootsByRepo, RESOLUTIONS, visibleRoots, type RepoThreadGroup } from './reviewModel';

// The tab badge, Resolve all, the blocker list and Code Changes all count with the approve guard's rule.
export function useBlockingReviewCount(): number {
  return useStore((s) => (s.state === null ? 0 : blockingRoots(s.state).length));
}

// A finished ticket can no longer be approved, so review counts and bulk actions no longer apply.
export function useIsTicketFinished(): boolean {
  return useStore((s) => s.state !== null && isFinalPhase(s.state.phase, s.state.phase_sequence));
}

// Bulk resolve is destructive, so it sits behind a quiet overflow control instead of leading the toolbar.
function ResolveAllMenu({ workspaceId, openCount, resolvedStillBlocking }: { readonly workspaceId: number; readonly openCount: number; readonly resolvedStillBlocking: number }): JSX.Element {
  const t = useT();
  const dialogs = useDialogs();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [isOpen, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [resolution, setResolution] = useState<string>(NO_RESOLUTION_CHOSEN);
  const resolveAll = useMutation((value: ReviewResolution) => resolveAllReview(workspaceId, value), { invalidates: ['reviewThreads', 'comments'], refreshState: true });
  const options = [{ value: NO_RESOLUTION_CHOSEN, label: t('vsc.review.chooseResolution') }, ...RESOLUTIONS.map((value) => ({ value, label: capitalizeFirstLetter(t(`review.resolution.${value}`)) }))];
  const resolveLabel = t(pluralKey('vsc.review.resolveOpen', openCount), { count: openCount });
  const confirmAndResolve = async (): Promise<void> => {
    setOpen(false);
    const message = t('vsc.review.resolveAllConfirm', { count: openCount, resolution: t(`review.resolution.${resolution}`) });
    if (await dialogs.confirm({ title: resolveLabel, message, confirmLabel: t('vsc.common.resolve') })) {
      const result = await resolveAll.run(resolution as ReviewResolution);
      if (result !== undefined) {
        toasts.success(t('review.resolveAllDone', { count: result.resolved_count }));
      }
    }
  };
  const toggle = (event: MouseEvent): void => {
    setAnchor(event.currentTarget as HTMLElement);
    setOpen(!isOpen);
  };
  return (
    <>
      <Button size="sm" variant="ghost" icon="ellipsis" label={t('vsc.review.bulkActions')} busy={resolveAll.pending} onClick={toggle} />
      <Popover open={isOpen} anchor={anchor} onClose={close}>
        <div class="gw-review-resolve-all">
          <span class="gw-muted" aria-hidden="true">{t('vsc.review.resolveAs')}</span>
          <Select title={t('vsc.review.resolveAs')} value={resolution} options={options} onChange={setResolution} />
          <Button size="sm" icon="check-all" label={resolveLabel} disabled={resolution === NO_RESOLUTION_CHOSEN} onClick={confirmAndResolve} />
          {resolvedStillBlocking > 0 && <span class="gw-muted">{t(pluralKey('vsc.review.resolvedNeedClosing', resolvedStillBlocking), { count: resolvedStillBlocking })}</span>}
        </div>
      </Popover>
    </>
  );
}

// Threads the agent marked with a resolution no longer block approval but still await the user, so they sit apart from open ones.
function ThreadList({ roots }: { readonly roots: readonly ReviewComment[] }): JSX.Element {
  const t = useT();
  const { active, addressed } = groupRoots(roots);
  return (
    <div class="gw-review-threads">
      {active.map((comment) => <ReviewThreadItem key={comment.id} comment={comment} />)}
      {addressed.length > 0 && (
        <section class="gw-review-group">
          <h3 class="gw-review-group__title">{t('vsc.review.addressedGroup', { count: addressed.length })}</h3>
          {addressed.map((comment) => <ReviewThreadItem key={comment.id} comment={comment} />)}
        </section>
      )}
    </div>
  );
}

function RepoThreadSection({ group }: { readonly group: RepoThreadGroup }): JSX.Element {
  const t = useT();
  const name = group.repo?.name ?? t('vsc.review.outsideRepos');
  return (
    <section class="gw-review-repo" aria-label={name}>
      <h3 class="gw-review-repo__title">
        <Icon name="repo" />
        <span>{name}</span>
        <Badge tone="neutral" label={String(group.roots.length)} />
      </h3>
      <ThreadList roots={group.roots} />
    </section>
  );
}

// Only multi-repo workspaces group by repository; a single repository keeps the flat list.
function RepoThreadList({ roots, repos }: { readonly roots: readonly ReviewComment[]; readonly repos: readonly RepoEntry[] }): JSX.Element {
  if (repos.length <= 1) {
    return <ThreadList roots={roots} />;
  }
  return (
    <div class="gw-review-repos">
      {groupRootsByRepo(roots, repos).map((group) => <RepoThreadSection key={group.repo?.path ?? ''} group={group} />)}
    </div>
  );
}

// Without a blocker banner the blocking-threads jump still needs a landing spot, so it falls back to the top of the list.
function ThreadListAnchor({ isAnchorTarget, children }: { readonly isAnchorTarget: boolean; readonly children: ComponentChildren }): JSX.Element {
  const id = isAnchorTarget ? REVIEW_BLOCKING_ANCHOR : undefined;
  const [ref, isHighlighted] = useAnchorTarget<HTMLDivElement>(id);
  return <div id={id} ref={ref} class={classNames('gw-anchor-target', isHighlighted && 'gw-card-highlight')}>{children}</div>;
}

function NoThreads({ hasAnyThread }: { readonly hasAnyThread: boolean }): JSX.Element {
  const t = useT();
  const hint = hasAnyThread ? undefined : <p class="gw-muted">{t('vsc.review.pipelineHint')}</p>;
  return <EmptyState icon="comment" message={t('review.noComments')} action={hint} />;
}

export function ReviewTab({ active }: TabProps): JSX.Element {
  const t = useT();
  const state = useWorkspaceState();
  const [showResolved, setShowResolved] = usePersistentState('review.showResolved', false);
  const threads = useResource('reviewThreads', REVIEW_SCOPE, () => listComments({ scope: REVIEW_SCOPE }), { active });
  const repos = useResource('git', 'changes.repos', listRepos, { active, refetchOnState: false });
  const comments = threads.data?.comments ?? [];
  const isFinished = useIsTicketFinished();
  const blockers = isFinished ? [] : blockingRoots(state);
  const resolvableCount = isFinished ? 0 : unresolvedRootCount(state);
  const resolvedStillBlocking = isFinished ? 0 : resolvedBlockingCount(state);
  const roots = visibleRoots(comments, showResolved);
  const hasBlockerBanner = state.pending_gate !== null && blockers.length > 0;
  return (
    <div class="gw-review">
      <Toolbar align="between">
        <Button variant="ghost" icon={showResolved ? 'eye-closed' : 'eye'} label={t(showResolved ? 'review.hideResolved' : 'review.showResolved')} onClick={() => setShowResolved(!showResolved)} />
        {resolvableCount > 0 && <ResolveAllMenu workspaceId={state.workspace_id} openCount={resolvableCount} resolvedStillBlocking={resolvedStillBlocking} />}
      </Toolbar>
      {hasBlockerBanner && <ApprovalBlockers blockers={blockers} />}
      <ThreadListAnchor isAnchorTarget={!hasBlockerBanner}>
        <ResourceView resource={threads}>
          {() => (roots.length === 0 ? <NoThreads hasAnyThread={comments.length > 0} /> : <RepoThreadList roots={roots} repos={repos.data?.repos ?? []} />)}
        </ResourceView>
      </ThreadListAnchor>
    </div>
  );
}
