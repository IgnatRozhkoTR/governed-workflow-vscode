import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import { authorLabel } from '../../../src/comments/commentMapping';
import { useT } from '../i18n/i18n';
import { Button } from './Button';
import { TextField } from './TextField';
import { TimeAgo } from './TimeAgo';
import { toasts } from './ToastHost';
import { Toolbar } from './Toolbar';
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
  readonly onDelete?: () => Promise<void>;
  readonly resolveLabel?: string;
  readonly unresolveLabel?: string;
  readonly collapsedWhenResolved?: boolean;
}

function useAuthorLabel(): (author: string) => string {
  const t = useT();
  return (author) => {
    const key = `author.${author}`;
    const translated = t(key);
    return translated === key ? authorLabel(author) : translated;
  };
}

function MessageBody({ message }: { readonly message: ThreadMessage }): JSX.Element {
  const labelOf = useAuthorLabel();
  return (
    <div class="gw-thread-message">
      <div class="gw-thread-meta">
        <strong class="gw-thread-author">{labelOf(message.author || 'user')}</strong>
        <TimeAgo iso={message.createdAt} />
      </div>
      <div class="gw-thread-text">{message.text}</div>
    </div>
  );
}

interface ReplyBoxProps {
  readonly onReply: (text: string) => Promise<void>;
  readonly onClose: () => void;
}

function ReplyBox({ onReply, onClose }: ReplyBoxProps): JSX.Element {
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
      onClose();
    } catch (error) {
      toasts.error(error);
    }
  };
  const closeOnEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };
  return (
    <div class="gw-thread-reply" onKeyDown={closeOnEscape}>
      <TextField value={draft} onInput={setDraft} placeholder={t('placeholders.reply')} ariaLabel={t('buttons.reply')} multiline rows={2} autoFocus submitOn="enter" onSubmit={() => void send()} />
      <Toolbar>
        <Button size="sm" label={t('buttons.reply')} disabled={draft.trim() === ''} onClick={send} />
        <Button size="sm" variant="ghost" label={t('vsc.common.cancel')} onClick={onClose} />
      </Toolbar>
    </div>
  );
}

interface ReplyComposer {
  readonly isOpen: boolean;
  readonly isReturningFocus: boolean;
  readonly open: () => void;
  readonly close: () => void;
}

// Idle threads show a Reply button instead of an open composer, so long thread lists stay compact.
function useReplyComposer(): ReplyComposer {
  const [isOpen, setOpen] = useState(false);
  const [isReturningFocus, setReturningFocus] = useState(false);
  const close = (): void => {
    setOpen(false);
    setReturningFocus(true);
  };
  return { isOpen, isReturningFocus, open: () => setOpen(true), close };
}

export function ThreadView(props: ThreadViewProps): JSX.Element {
  const { root, replies, resolved, badges, headerExtra, onReply, collapsedWhenResolved = false } = props;
  const [isExpanded, setExpanded] = useState(!(collapsedWhenResolved && resolved));
  const composer = useReplyComposer();
  const canReply = isExpanded && !resolved && onReply !== undefined;
  return (
    <div class={classNames('gw-thread', resolved && 'gw-thread-resolved')}>
      <div class="gw-thread-header">
        {badges}
        {headerExtra}
      </div>
      <MessageBody message={root} />
      {isExpanded && replies.map((reply) => <MessageBody key={reply.id} message={reply} />)}
      <ThreadActions
        {...props}
        isExpanded={isExpanded}
        onToggleExpanded={collapsedWhenResolved && resolved && replies.length > 0 ? () => setExpanded(!isExpanded) : undefined}
        onOpenReply={canReply && !composer.isOpen ? composer.open : undefined}
        isReplyFocused={composer.isReturningFocus}
      />
      {canReply && composer.isOpen && <ReplyBox onReply={onReply} onClose={composer.close} />}
    </div>
  );
}

interface ThreadActionsProps extends ThreadViewProps {
  readonly isExpanded: boolean;
  readonly onToggleExpanded?: () => void;
  readonly onOpenReply?: () => void;
  readonly isReplyFocused: boolean;
}

function ThreadActions({ root, resolved, isExpanded, onToggleResolved, onDelete, resolveLabel, unresolveLabel, onToggleExpanded, onOpenReply, isReplyFocused }: ThreadActionsProps): JSX.Element | null {
  const t = useT();
  if (onToggleExpanded === undefined && onOpenReply === undefined && onToggleResolved === undefined && onDelete === undefined) {
    return null;
  }
  return (
    <Toolbar>
      {onToggleExpanded !== undefined && (
        <Button size="sm" variant="ghost" icon={isExpanded ? 'chevron-down' : 'chevron-right'} onClick={onToggleExpanded} title={root.text} />
      )}
      {onOpenReply !== undefined && <Button size="sm" variant="ghost" icon="reply" label={t('buttons.reply')} autoFocus={isReplyFocused} onClick={onOpenReply} />}
      {onToggleResolved !== undefined && (
        <Button
          size="sm"
          variant="ghost"
          icon={resolved ? 'issue-reopened' : 'check'}
          label={resolved ? (unresolveLabel ?? t('buttons.unresolve')) : (resolveLabel ?? t('vsc.common.resolve'))}
          onClick={() => onToggleResolved(!resolved).catch(toasts.error)}
        />
      )}
      {onDelete !== undefined && <Button size="sm" variant="ghost" icon="trash" label={t('buttons.delete')} onClick={() => onDelete().catch(toasts.error)} />}
    </Toolbar>
  );
}
