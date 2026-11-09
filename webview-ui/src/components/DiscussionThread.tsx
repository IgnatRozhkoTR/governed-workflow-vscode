import type { Discussion } from '@api-types';
import type { ComponentChildren, JSX } from 'preact';
import { replyDiscussion, updateDiscussion } from '../api/core';
import { store } from '../store/store';
import { ThreadView, type ThreadMessage } from './ThreadView';

export interface DiscussionThreadProps {
  readonly discussion: Discussion;
  readonly badges?: ComponentChildren;
}

const RESOLVED_STATUS = 'resolved';

async function changeDiscussion(change: Promise<unknown>): Promise<void> {
  await change;
  store.invalidate('context');
  await store.refreshState();
}

function toMessage(entry: { id: number; author: string; text: string; created_at: string; status: string }): ThreadMessage {
  return { id: entry.id, author: entry.author, text: entry.text, createdAt: entry.created_at, resolved: entry.status === RESOLVED_STATUS };
}

export function DiscussionThread({ discussion, badges }: DiscussionThreadProps): JSX.Element {
  return (
    <ThreadView
      root={toMessage(discussion)}
      replies={discussion.replies.map(toMessage)}
      resolved={discussion.status === RESOLVED_STATUS}
      badges={badges}
      onReply={(text) => changeDiscussion(replyDiscussion(discussion.id, text))}
      onToggleResolved={(next) => changeDiscussion(updateDiscussion(discussion.id, { status: next ? 'resolved' : 'open' }))}
    />
  );
}
