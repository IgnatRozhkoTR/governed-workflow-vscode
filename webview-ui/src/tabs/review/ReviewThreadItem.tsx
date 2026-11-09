import type { ReviewComment } from '@api-types';
import type { JSX } from 'preact';
import { isOutdated } from '../../../../src/comments/commentMapping';
import { getFileSnippet } from '../../api/core';
import { Badge, CodeRef, ThreadView, type ThreadMessage } from '../../components';
import { useT } from '../../i18n/i18n';
import { useResource } from '../../store/hooks';
import { addReplyAndRefresh, setResolvedAndRefresh } from './reviewActions';
import { hasResolutionBadge, prettifyAuthor, resolutionTone } from './reviewModel';

function useAuthorLabel(): (author: string) => string {
  const t = useT();
  return (author) => {
    const key = `author.${author}`;
    const translated = t(key);
    return translated === key ? prettifyAuthor(author) : translated;
  };
}

function OutdatedMarker({ comment }: { readonly comment: ReviewComment }): JSX.Element | null {
  const t = useT();
  const { file_path: path, line_start: line } = comment;
  const hasAnchor = path !== null && line !== null && comment.line_hash !== null;
  const snippet = useResource('reviewThreads', `outdated:${comment.id}:${path}:${line}`, () => getFileSnippet(path ?? '', line ?? 1, line ?? 1), { active: hasAnchor, refetchOnState: false });
  const currentLine = snippet.data?.lines[0];
  if (currentLine === undefined || !isOutdated(comment, currentLine)) {
    return null;
  }
  return <Badge label={t('comments.outdated')} tone="warning" />;
}

export function ReviewThreadItem({ comment }: { readonly comment: ReviewComment }): JSX.Element {
  const t = useT();
  const authorLabel = useAuthorLabel();
  const toMessage = (source: { id: number; author: string; text: string; created_at: string }, resolved?: boolean): ThreadMessage => ({
    id: source.id,
    author: authorLabel(source.author || 'user'),
    text: source.text,
    createdAt: source.created_at,
    resolved,
  });
  const badges = (
    <>
      {comment.file_path !== null && comment.file_path !== '' && (
        <CodeRef path={comment.file_path} lineStart={comment.line_start ?? undefined} lineEnd={comment.line_end ?? undefined} quote />
      )}
      {hasResolutionBadge(comment) && <Badge label={t(`review.resolution.${comment.resolution}`)} tone={resolutionTone(comment.resolution)} />}
      <OutdatedMarker comment={comment} />
    </>
  );
  return (
    <ThreadView
      root={toMessage(comment, comment.resolved)}
      replies={(comment.replies ?? []).map((reply) => toMessage(reply))}
      resolved={comment.resolved}
      badges={badges}
      collapsedWhenResolved
      onReply={(text) => addReplyAndRefresh(comment.id, text)}
      onToggleResolved={(next) => setResolvedAndRefresh(comment.id, next)}
    />
  );
}
