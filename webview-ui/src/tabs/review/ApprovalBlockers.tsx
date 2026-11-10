import type { ReviewComment } from '@api-types';
import type { JSX } from 'preact';
import { Icon } from '../../components';
import { pluralKey } from '../../components/plural';
import { classNames } from '../../components/types';
import { scrollToAnchor, useAnchorTarget } from '../../components/useAnchor';
import { useOpenState } from '../../components/useOpenState';
import { useT } from '../../i18n/i18n';
import { isResolvedButBlocking } from './reviewBlocking';
import { ReopenBlockerButton, reviewThreadElementId } from './ReviewThreadItem';

const JUMP_FLASH_CLASS = 'gw-card-highlight';

// A jump flashes the thread's background like card jumps do; the focus ring stays reserved for keyboard focus.
function revealThread(commentId: number): void {
  const element = document.getElementById(reviewThreadElementId(commentId));
  if (element === null) {
    return;
  }
  element.classList.remove(JUMP_FLASH_CLASS);
  scrollToAnchor(element);
  element.classList.add(JUMP_FLASH_CLASS);
  element.addEventListener('animationend', () => element.classList.remove(JUMP_FLASH_CLASS), { once: true });
  element.focus({ preventScroll: true });
}

function blockerLabel(comment: ReviewComment): string {
  const location = comment.file_path ?? comment.target ?? '';
  const line = comment.line_start === null ? '' : `:${comment.line_start}`;
  return location === '' ? comment.text : `${location}${line}`;
}

function MarkedResolvedNote({ commentId }: { readonly commentId: number }): JSX.Element {
  const t = useT();
  return (
    <span class="gw-review-blocker-note">
      <Icon name="warning" />
      <span>{t('vsc.review.markedResolved')}</span>
      <ReopenBlockerButton commentId={commentId} />
    </span>
  );
}

function BlockerLink({ comment }: { readonly comment: ReviewComment }): JSX.Element {
  return (
    <li class={classNames(isResolvedButBlocking(comment) && 'gw-review-blocker-resolved')}>
      <button type="button" class="gw-link" title={comment.text} onClick={() => revealThread(comment.id)}>{blockerLabel(comment)}</button>
      {isResolvedButBlocking(comment) && <MarkedResolvedNote commentId={comment.id} />}
    </li>
  );
}

// The shell's blocking-threads links land here; the list opens on arrival so the jump shows what blocks.
export const REVIEW_BLOCKING_ANCHOR = 'review-blocking';

// The threads are listed below, so the banner stays one line and the jump list opens only on request or on arrival.
export function ApprovalBlockers({ blockers }: { readonly blockers: readonly ReviewComment[] }): JSX.Element {
  const t = useT();
  const [isOpen, toggle, setOpen] = useOpenState(false, undefined);
  const [ref, isHighlighted] = useAnchorTarget<HTMLDivElement>(REVIEW_BLOCKING_ANCHOR, () => setOpen(true));
  return (
    <div id={REVIEW_BLOCKING_ANCHOR} ref={ref} class={classNames('gw-review-blockers gw-anchor-target', isHighlighted && 'gw-card-highlight')} role="status">
      <div class="gw-collapsible">
        <button type="button" class="gw-collapsible-summary" aria-expanded={isOpen} onClick={toggle}>
          <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} />
          <span><strong>{t(pluralKey('vsc.review.blockersTitle', blockers.length), { count: blockers.length })}</strong></span>
        </button>
        {isOpen && <div class="gw-collapsible-body"><ul>{blockers.map((comment) => <BlockerLink key={comment.id} comment={comment} />)}</ul></div>}
      </div>
    </div>
  );
}
