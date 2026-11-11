import type { ReviewComment } from '@api-types';
import type { JSX } from 'preact';
import { isOutdated } from '../../../../src/comments/commentMapping';
import { getFileSnippet } from '../../api/core';
import { Badge, Button, CodeRef, Icon, ThreadView, type ThreadMessage } from '../../components';
import { rpc } from '../../rpc/rpcClient';
import { toasts } from '../../components/ToastHost';
import { useT } from '../../i18n/i18n';
import { capitalizeFirstLetter } from '../../lib/format';
import { useResource } from '../../store/hooks';
import { addReplyAndRefresh, setResolvedAndRefresh } from './reviewActions';
import { isResolvedButBlocking } from './reviewBlocking';
import { hasResolutionBadge, isAddressedNotClosed, resolutionTone, severityTone, splitSeverity, type Severity } from './reviewModel';

type MessageSource = Pick<ReviewComment, 'id' | 'author' | 'text' | 'created_at'>;

function toMessage(source: MessageSource, text = source.text): ThreadMessage {
  return { id: source.id, author: source.author, text, createdAt: source.created_at };
}

function OutdatedMarker({ comment }: { readonly comment: ReviewComment }): JSX.Element | null {
  const t = useT();
  const { file_path: path, line_start: line } = comment;
  const hasAnchor = path !== null && line !== null && comment.line_hash !== null;
  const snippet = useResource('reviewThreads', `outdated:${comment.id}:${path}:${line}`, () => getFileSnippet(path ?? '', line ?? 1, line ?? 1), { active: hasAnchor, refetchOnState: false });
  const data = snippet.data;
  const currentLine = data === undefined || line === null ? undefined : data.lines[line - (data.start ?? line)];
  if (currentLine === undefined || !isOutdated(comment, currentLine)) {
    return null;
  }
  return <Badge label={capitalizeFirstLetter(t('comments.outdated'))} tone="warning" />;
}

function CommentLocation({ comment }: { readonly comment: ReviewComment }): JSX.Element | null {
  const { file_path: path, line_start: lineStart, line_end: lineEnd, target } = comment;
  if (path !== null && path !== '') {
    const isLineComment = lineStart !== null;
    return <CodeRef path={path} lineStart={lineStart ?? undefined} lineEnd={lineEnd ?? undefined} quote={isLineComment} />;
  }
  return target === null || target === '' ? null : <FileLevelTarget commentId={comment.id} target={target} />;
}

function FileLevelTarget({ commentId, target }: { readonly commentId: number; readonly target: string }): JSX.Element {
  const reveal = (): void => {
    rpc.call('native.revealCommentThread', { commentId }).catch(toasts.error);
  };
  return (
    <span class="gw-code-ref">
      <button type="button" class="gw-link" title={target} onClick={reveal}>
        <Icon name="file-code" />
        <span>{target}</span>
      </button>
    </span>
  );
}

function SeverityBadge({ severity }: { readonly severity: Severity | undefined }): JSX.Element | null {
  const t = useT();
  return severity === undefined ? null : <Badge label={t(`vsc.review.severity.${severity}`)} tone={severityTone(severity)} />;
}

export function reviewThreadElementId(commentId: number): string {
  return `gw-review-thread-${commentId}`;
}

// Only legacy rows can be resolved without a result; Resolve all clears them, and reopening is the alternative.
export function ReopenBlockerButton({ commentId }: { readonly commentId: number }): JSX.Element {
  const t = useT();
  return (
    <Button
      size="sm"
      variant="ghost"
      icon="issue-reopened"
      label={t('vsc.review.reopen')}
      title={t('vsc.review.stillBlockingHint')}
      onClick={() => setResolvedAndRefresh(commentId, false).catch(toasts.error)}
    />
  );
}

// Only legacy rows can stay counted after Resolve, so the marker warns rather than alarms and carries its own fix.
function StillBlockingMarker({ commentId }: { readonly commentId: number }): JSX.Element {
  const t = useT();
  return (
    <span class="gw-review-still-blocking">
      <Badge label={t('vsc.review.stillBlocking')} tone="warning" title={t('vsc.review.stillBlockingHint')} />
      <ReopenBlockerButton commentId={commentId} />
    </span>
  );
}

function ResolutionBadge({ comment }: { readonly comment: ReviewComment }): JSX.Element | null {
  const t = useT();
  if (!hasResolutionBadge(comment)) {
    return null;
  }
  const resolution = t(`review.resolution.${comment.resolution}`);
  const label = isAddressedNotClosed(comment) ? t('vsc.review.addressedBy', { resolution }) : capitalizeFirstLetter(resolution);
  return <Badge label={label} tone={resolutionTone(comment.resolution)} />;
}

export function ReviewThreadItem({ comment }: { readonly comment: ReviewComment }): JSX.Element {
  const t = useT();
  const { severity, text } = splitSeverity(comment.text);
  const isStillBlocking = isResolvedButBlocking(comment);
  const badges = (
    <>
      <SeverityBadge severity={severity} />
      <CommentLocation comment={comment} />
      <ResolutionBadge comment={comment} />
      <OutdatedMarker comment={comment} />
      {isStillBlocking && <StillBlockingMarker commentId={comment.id} />}
    </>
  );
  return (
    <div id={reviewThreadElementId(comment.id)} class="gw-review-thread-anchor gw-anchor-target" tabIndex={-1}>
      <ThreadView
        root={toMessage(comment, text)}
        replies={(comment.replies ?? []).map((reply) => toMessage(reply))}
        resolved={comment.resolved}
        badges={badges}
        collapsedWhenResolved
        onReply={(reply) => addReplyAndRefresh(comment.id, reply)}
        onToggleResolved={isStillBlocking ? undefined : (next) => setResolvedAndRefresh(comment.id, next)}
        resolveLabel={isAddressedNotClosed(comment) ? t('vsc.review.close') : undefined}
      />
    </div>
  );
}
