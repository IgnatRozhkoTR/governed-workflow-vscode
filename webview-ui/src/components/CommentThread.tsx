import type { NewComment, Reply, ReviewComment } from '@api-types';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { addComment, replyComment, resolveComment } from '../api/core';
import { useT } from '../i18n/i18n';
import { useComments, useMutation } from '../store/hooks';
import { store } from '../store/store';
import { Button } from './Button';
import { TextField } from './TextField';
import { ThreadView, type ThreadMessage } from './ThreadView';

export interface CommentThreadProps {
  readonly scope: string;
  readonly target: string;
  readonly filePath?: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly showResolved?: boolean;
}

const COMMENT_MUTATION = { invalidates: ['comments'], refreshState: true } as const;

export function toThreadMessage(entry: ReviewComment | Reply): ThreadMessage {
  return { id: entry.id, author: entry.author, text: entry.text, createdAt: entry.created_at, resolved: 'resolved' in entry ? entry.resolved : undefined };
}

async function changeComments(change: Promise<unknown>): Promise<void> {
  await change;
  store.invalidate(...COMMENT_MUTATION.invalidates);
  await store.refreshState();
}

export function CommentThread(props: CommentThreadProps): JSX.Element {
  const { scope, target, showResolved = true } = props;
  const t = useT();
  const roots = useComments(scope, target).filter((root) => showResolved || !root.resolved);
  return (
    <div class="gw-comment-thread">
      <div class="gw-comment-thread-title">{t('comments.title')}</div>
      {roots.map((root) => (
        <ThreadView
          key={root.id}
          root={toThreadMessage(root)}
          replies={(root.replies ?? []).map(toThreadMessage)}
          resolved={root.resolved}
          collapsedWhenResolved
          onReply={(text) => changeComments(replyComment(root.id, text))}
          onToggleResolved={(next) => changeComments(resolveComment(root.id, next))}
        />
      ))}
      <NewCommentBox {...props} />
    </div>
  );
}

function NewCommentBox({ scope, target, filePath, lineStart, lineEnd }: CommentThreadProps): JSX.Element {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [optimistic, setOptimistic] = useState<string | undefined>(undefined);
  const add = useMutation((comment: NewComment) => addComment(comment), COMMENT_MUTATION);
  const submit = async (): Promise<void> => {
    const text = draft.trim();
    if (text === '' || add.pending) {
      return;
    }
    setOptimistic(text);
    setDraft('');
    const created = await add.run({ scope, target, text, file_path: filePath, line_start: lineStart, line_end: lineEnd });
    setOptimistic(undefined);
    if (created === undefined) {
      setDraft(text);
    }
  };
  return (
    <div class="gw-comment-new">
      {optimistic !== undefined && <div class="gw-thread gw-thread-pending"><div class="gw-thread-text">{optimistic}</div></div>}
      <TextField value={draft} onInput={setDraft} placeholder={t('comments.addComment')} multiline rows={2} submitOn="enter" onSubmit={() => void submit()} />
      <Button size="sm" variant="primary" label={t('comments.save')} disabled={draft.trim() === ''} busy={add.pending} onClick={submit} />
    </div>
  );
}
