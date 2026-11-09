import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { listComments } from '../../api/core';
import { resolveAllReview, type ReviewResolution } from '../../api/review';
import { Button, EmptyState, ResourceView, Select, Toolbar, useDialogs } from '../../components';
import { toasts } from '../../components/ToastHost';
import { useT } from '../../i18n/i18n';
import { useMutation, usePersistentState, useResource, useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { ReviewThreadItem } from './ReviewThreadItem';
import { countOpenRoots, DEFAULT_RESOLUTION, RESOLUTIONS, visibleRoots } from './reviewModel';

function ResolveAll({ workspaceId, openCount }: { readonly workspaceId: number; readonly openCount: number }): JSX.Element {
  const t = useT();
  const dialogs = useDialogs();
  const [resolution, setResolution] = useState<string>(DEFAULT_RESOLUTION);
  const resolveAll = useMutation((value: ReviewResolution) => resolveAllReview(workspaceId, value), { invalidates: ['reviewThreads', 'comments'], refreshState: true });
  const options = RESOLUTIONS.map((value) => ({ value, label: t(`review.resolution.${value}`) }));
  const confirmAndResolve = async (): Promise<void> => {
    const message = t('vsc.review.resolveAllConfirm', { count: openCount, resolution: t(`review.resolution.${resolution}`) });
    if (await dialogs.confirm({ title: t('review.resolveAll', { count: openCount }), message, confirmLabel: t('buttons.resolve') })) {
      const result = await resolveAll.run(resolution as ReviewResolution);
      if (result !== undefined) {
        toasts.success(t('review.resolveAllDone', { count: result.resolved_count }));
      }
    }
  };
  return (
    <span class="gw-review-resolve-all">
      <Select value={resolution} options={options} onChange={setResolution} disabled={resolveAll.pending} />
      <Button icon="check-all" label={t('review.resolveAll', { count: openCount })} busy={resolveAll.pending} onClick={confirmAndResolve} />
    </span>
  );
}

export function ReviewTab({ active }: TabProps): JSX.Element {
  const t = useT();
  const { workspace_id: workspaceId } = useWorkspaceState();
  const [showResolved, setShowResolved] = usePersistentState('review.showResolved', false);
  const threads = useResource('reviewThreads', 'review', () => listComments({ scope: 'review' }), { active });
  const comments = threads.data?.comments ?? [];
  const openCount = countOpenRoots(comments);
  const roots = visibleRoots(comments, showResolved);
  return (
    <div class="gw-review">
      <Toolbar align="between">
        <Button variant="ghost" icon={showResolved ? 'eye-closed' : 'eye'} label={t(showResolved ? 'review.hideResolved' : 'review.showResolved')} onClick={() => setShowResolved(!showResolved)} />
        {openCount > 0 && <ResolveAll workspaceId={workspaceId} openCount={openCount} />}
      </Toolbar>
      <ResourceView resource={threads}>
        {() => (roots.length === 0
          ? <EmptyState icon="comment" message={t('review.noComments')} />
          : <div class="gw-review-threads">{roots.map((comment) => <ReviewThreadItem key={comment.id} comment={comment} />)}</div>)}
      </ResourceView>
    </div>
  );
}
