import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import { createDiscussion } from '../../api/core';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { TextField } from '../../components/TextField';
import { toasts } from '../../components/ToastHost';
import { useT } from '../../i18n/i18n';
import { useMutation } from '../../store/hooks';

export interface InlineDiscussionProps {
  readonly scope: 'research' | 'impact';
  readonly target: string;
  readonly children?: ComponentChildren;
}

const AFTER_CREATE = { invalidates: ['context'], refreshState: true } as const;

export function InlineDiscussion({ scope, target, children }: InlineDiscussionProps): JSX.Element {
  const t = useT();
  const [isOpen, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const create = useMutation((text: string) => createDiscussion({ text, type: 'scope', scope, target }), AFTER_CREATE);
  const submit = async (): Promise<void> => {
    const text = draft.trim();
    if (text === '') {
      return;
    }
    if ((await create.run(text)) !== undefined) {
      setDraft('');
      setOpen(false);
      toasts.success(t('preplanning.commentAdded'));
    }
  };
  return (
    <div class="gw-pp-inline">
      <div class="gw-pp-inline-content">{children}</div>
      <div class="gw-pp-inline-affordance">
        <IconButton icon="comment-discussion" title={t('vsc.preplanning.commentOnItem')} tone={isOpen ? 'accent' : undefined} onClick={() => setOpen(!isOpen)} />
      </div>
      {isOpen && (
        <div class="gw-pp-inline-form">
          <TextField value={draft} onInput={setDraft} placeholder={t('comments.addComment')} autoFocus onSubmit={() => void submit()} />
          <Button variant="primary" size="sm" label={t('comments.save')} busy={create.pending} disabled={draft.trim() === ''} onClick={submit} />
        </div>
      )}
    </div>
  );
}
