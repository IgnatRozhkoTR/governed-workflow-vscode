import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import { useT } from '../i18n/i18n';
import { Button } from './Button';
import { TextField } from './TextField';
import { TimeAgo } from './TimeAgo';
import { toasts } from './ToastHost';
import { classNames } from './types';

export interface ThreadMessage {
  readonly id: number;
  readonly author: string;
  readonly text: string;
  readonly createdAt: string;
  readonly resolved?: boolean;
}

export interface ThreadViewProps {
  readonly root: ThreadMessage;
  readonly replies: readonly ThreadMessage[];
  readonly resolved: boolean;
  readonly badges?: ComponentChildren;
  readonly headerExtra?: ComponentChildren;
  // Callbacks reject on failure; ThreadView reports the error and keeps the reply draft.
  readonly onReply?: (text: string) => Promise<void>;
  readonly onToggleResolved?: (next: boolean) => Promise<void>;
  readonly collapsedWhenResolved?: boolean;
}

function MessageBody({ message, extra }: { readonly message: ThreadMessage; readonly extra?: ComponentChildren }): JSX.Element {
  return (
    <div class="gw-thread-message">
      <div class="gw-thread-meta">
        <strong class="gw-thread-author">{message.author}</strong>
        <TimeAgo iso={message.createdAt} />
        {extra}
      </div>
      <div class="gw-thread-text">{message.text}</div>
    </div>
  );
}

function ReplyBox({ onReply }: { readonly onReply: (text: string) => Promise<void> }): JSX.Element {
  const t = useT();
  const [draft, setDraft] = useState('');
  const send = async (): Promise<void> => {
    const text = draft.trim();
    if (text === '') {
      return;
    }
    try {
      await onReply(text);
      setDraft('');
    } catch (error) {
      toasts.error(error);
    }
  };
  return (
    <div class="gw-thread-reply">
      <TextField value={draft} onInput={setDraft} placeholder={t('placeholders.reply')} multiline rows={2} submitOn="enter" onSubmit={() => void send()} />
      <Button size="sm" label={t('buttons.reply')} disabled={draft.trim() === ''} onClick={send} />
    </div>
  );
}

export function ThreadView(props: ThreadViewProps): JSX.Element {
  const { root, replies, resolved, badges, headerExtra, onReply, onToggleResolved, collapsedWhenResolved = false } = props;
  const t = useT();
  const [isExpanded, setExpanded] = useState(!(collapsedWhenResolved && resolved));
  const resolveButton = onToggleResolved === undefined ? undefined : (
    <Button size="sm" variant="ghost" icon={resolved ? 'issue-reopened' : 'check'} label={t(resolved ? 'buttons.unresolve' : 'buttons.resolve')} onClick={() => onToggleResolved(!resolved).catch(toasts.error)} />
  );
  return (
    <div class={classNames('gw-thread', resolved && 'gw-thread-resolved')}>
      <div class="gw-thread-header">
        {badges}
        {headerExtra}
        {collapsedWhenResolved && resolved && (
          <Button size="sm" variant="ghost" icon={isExpanded ? 'chevron-down' : 'chevron-right'} onClick={() => setExpanded(!isExpanded)} title={root.text} />
        )}
        {resolveButton}
      </div>
      <MessageBody message={root} />
      {isExpanded && replies.map((reply) => <MessageBody key={reply.id} message={reply} />)}
      {isExpanded && !resolved && onReply !== undefined && <ReplyBox onReply={onReply} />}
    </div>
  );
}
