import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useOpenCommentCount } from '../store/hooks';
import { CommentButton } from './CommentIcon';
import { CommentThread } from './CommentThread';
import { classNames } from './types';
import { useCommentFocus } from './useCommentFocus';

export interface CommentableProps {
  readonly scope: string;
  readonly target: string;
  readonly label?: string;
  readonly filePath?: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly children?: ComponentChildren;
}

export function Commentable({ scope, target, label, filePath, lineStart, lineEnd, children }: CommentableProps): JSX.Element {
  const focus = useCommentFocus(scope, target);
  const count = useOpenCommentCount(scope, target);
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus.isOpen) {
      threadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focus.isOpen]);
  return (
    <div class={classNames('gw-commentable', (count > 0 || focus.isOpen) && 'gw-commentable-pinned')}>
      <div class="gw-commentable-content">{children}</div>
      <div class="gw-commentable-affordance">
        <CommentButton scope={scope} target={target} label={label} focus={focus} />
      </div>
      {focus.isOpen && (
        <div ref={threadRef} class="gw-commentable-thread">
          <CommentThread scope={scope} target={target} filePath={filePath} lineStart={lineStart} lineEnd={lineEnd} />
        </div>
      )}
    </div>
  );
}
