import type { ReviewComment } from '@api-types';
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { createDiscussion, deleteDiscussion } from '../../api/core';
import { Button } from '../../components/Button';
import { CommentRoots } from '../../components/CommentThread';
import { useDialogs } from '../../components/DialogHost';
import { Icon } from '../../components/Icon';
import { TextField } from '../../components/TextField';
import { classNames } from '../../components/types';
import { toasts } from '../../components/ToastHost';
import { useCommentFocus, type CommentFocus } from '../../components/useCommentFocus';
import { useT } from '../../i18n/i18n';
import { useMutation, useOpenCommentCount } from '../../store/hooks';
import { store } from '../../store/store';

type InlineScope = 'research' | 'impact';

export interface InlineDiscussionProps {
  readonly scope: InlineScope;
  readonly target: string;
  // The trigger goes into the item's own header row, so it reads as part of the item rather than floating beside it.
  readonly renderItem: (trigger: JSX.Element) => ComponentChildren;
}

interface InlineTargetProps {
  readonly scope: InlineScope;
  readonly target: string;
}

const AFTER_CHANGE = { invalidates: ['context', 'comments'], refreshState: true } as const;

function DiscussionTrigger({ scope, target, focus }: InlineTargetProps & { readonly focus: CommentFocus }): JSX.Element {
  const t = useT();
  const openCount = useOpenCommentCount(scope, target);
  const label = openCount > 0 ? t('vsc.preplanning.openComments', { count: openCount }) : t('vsc.preplanning.commentOnItem');
  const toggle = (event: Event): void => {
    event.stopPropagation();
    focus.toggle();
  };
  return (
    <button type="button" class={classNames('gw-pp-comment-trigger', openCount > 0 && 'gw-pp-comment-trigger-open', focus.isOpen && 'gw-pp-comment-trigger-active')} title={label} aria-label={label} aria-expanded={focus.isOpen} onClick={toggle} onKeyDown={(event) => event.stopPropagation()}>
      <Icon name="comment-discussion" />
      {openCount > 0 && <span class="gw-pp-comment-count" aria-hidden="true">{openCount}</span>}
    </button>
  );
}

// Like the web, pre-planning comments go through the discussions endpoint, so the stored type matches the item kind.
function DiscussionForm({ scope, target }: InlineTargetProps): JSX.Element {
  const t = useT();
  const [draft, setDraft] = useState('');
  const create = useMutation((text: string) => createDiscussion({ text, type: scope, scope, target }), AFTER_CHANGE);
  const submit = async (): Promise<void> => {
    const text = draft.trim();
    if (text === '') {
      return;
    }
    if ((await create.run(text)) !== undefined) {
      setDraft('');
      toasts.success(t('preplanning.commentAdded'));
    }
  };
  return (
    <div class="gw-pp-inline-form">
      <TextField value={draft} onInput={setDraft} placeholder={t('comments.addComment')} autoFocus onSubmit={() => void submit()} />
      <Button variant="primary" size="sm" label={t('comments.save')} busy={create.pending} disabled={draft.trim() === ''} onClick={submit} />
    </div>
  );
}

// Deleting only the root would leave its replies behind as orphan rows, so replies go first.
async function deleteThread(root: ReviewComment): Promise<void> {
  for (const reply of root.replies ?? []) {
    await deleteDiscussion(reply.id);
  }
  await deleteDiscussion(root.id);
  store.invalidate(...AFTER_CHANGE.invalidates);
  await store.refreshState();
}

function useConfirmedThreadDelete(): (root: ReviewComment) => Promise<void> {
  const t = useT();
  const dialogs = useDialogs();
  return async (root) => {
    const isConfirmed = await dialogs.confirm({ title: t('buttons.delete'), message: t('vsc.preplanning.confirmDeleteComment'), confirmLabel: t('buttons.delete'), danger: true });
    if (isConfirmed) {
      await deleteThread(root);
    }
  };
}

function DiscussionPanel({ scope, target }: InlineTargetProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const deleteRoot = useConfirmedThreadDelete();
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);
  return (
    <div ref={panelRef} class="gw-pp-inline-thread">
      <CommentRoots scope={scope} target={target} onDelete={deleteRoot} />
      <DiscussionForm scope={scope} target={target} />
    </div>
  );
}

export function InlineDiscussion({ scope, target, renderItem }: InlineDiscussionProps): JSX.Element {
  const focus = useCommentFocus(scope, target);
  return (
    <div class="gw-pp-inline">
      {renderItem(<DiscussionTrigger scope={scope} target={target} focus={focus} />)}
      {focus.isOpen && <DiscussionPanel scope={scope} target={target} />}
    </div>
  );
}
