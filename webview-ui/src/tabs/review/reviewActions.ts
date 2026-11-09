import { replyComment, resolveComment } from '../../api/core';
import { store } from '../../store/store';

async function refreshThreads(): Promise<void> {
  store.invalidate('reviewThreads', 'comments');
  await store.refreshState();
}

export async function addReplyAndRefresh(commentId: number, text: string): Promise<void> {
  await replyComment(commentId, text);
  await refreshThreads();
}

export async function setResolvedAndRefresh(commentId: number, resolved: boolean): Promise<void> {
  await resolveComment(commentId, resolved);
  await refreshThreads();
}
