import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { useT } from '../i18n/i18n';
import { useOpenCommentCount } from '../store/hooks';
import { CommentThread } from './CommentThread';
import { Icon } from './Icon';
import { Popover } from './Popover';
import { classNames } from './types';
import { useCommentFocus, type CommentFocus } from './useCommentFocus';

export interface CommentIconProps {
  readonly scope: string;
  readonly target: string;
  readonly label?: string;
}

interface CommentButtonProps extends CommentIconProps {
  readonly focus: CommentFocus;
  readonly buttonRef?: (element: HTMLButtonElement | null) => void;
}

export function CommentButton({ scope, target, label, focus, buttonRef }: CommentButtonProps): JSX.Element {
  const t = useT();
  const count = useOpenCommentCount(scope, target);
  return (
    <button
      type="button"
      ref={buttonRef}
      class={classNames('gw-comment-icon', count > 0 && 'gw-comment-icon-open', focus.isOpen && 'gw-comment-icon-active')}
      title={label ?? t('comments.title')}
      aria-expanded={focus.isOpen}
      onClick={(event) => {
        event.stopPropagation();
        focus.toggle();
      }}
    >
      <Icon name="comment" />
      {count > 0 && <span class="gw-comment-count">{count}</span>}
    </button>
  );
}

export function CommentIcon({ scope, target, label }: CommentIconProps): JSX.Element {
  const focus = useCommentFocus(scope, target);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <CommentButton scope={scope} target={target} label={label} focus={focus} buttonRef={setAnchor} />
      <Popover open={focus.isOpen} anchor={anchor} onClose={focus.close}>
        <CommentThread scope={scope} target={target} />
      </Popover>
    </>
  );
}
