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
  // Rows that already show their own thread counter keep the icon as a plain affordance, so the number appears once.
  readonly isCountShown?: boolean;
}

interface CommentButtonProps extends CommentIconProps {
  readonly focus: CommentFocus;
  readonly buttonRef?: (element: HTMLButtonElement | null) => void;
}

export function CommentButton({ scope, target, label, isCountShown = true, focus, buttonRef }: CommentButtonProps): JSX.Element {
  const t = useT();
  const count = useOpenCommentCount(scope, target);
  const isCountVisible = isCountShown && count > 0;
  const accessibleName = count > 0 ? `${label ?? t('comments.title')} (${count})` : label ?? t('comments.addComment');
  return (
    <button
      type="button"
      ref={buttonRef}
      class={classNames('gw-comment-icon', isCountVisible && 'gw-comment-icon-open', focus.isOpen && 'gw-comment-icon-active')}
      title={accessibleName}
      aria-label={accessibleName}
      aria-expanded={focus.isOpen}
      onClick={(event) => {
        event.stopPropagation();
        focus.toggle();
      }}
    >
      <Icon name="comment" />
      {isCountVisible && <span class="gw-comment-count" aria-hidden="true">{count}</span>}
    </button>
  );
}

export function CommentIcon({ scope, target, label, isCountShown }: CommentIconProps): JSX.Element {
  const focus = useCommentFocus(scope, target);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <CommentButton scope={scope} target={target} label={label} isCountShown={isCountShown} focus={focus} buttonRef={setAnchor} />
      <Popover open={focus.isOpen} anchor={anchor} onClose={focus.close}>
        <CommentThread scope={scope} target={target} />
      </Popover>
    </>
  );
}
