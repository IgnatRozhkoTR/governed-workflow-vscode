// @vitest-environment happy-dom
import type { ReviewComment, WorkspaceState } from '@api-types';
import type { WebviewMessage } from '@shared/protocol';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogHost } from '../../../webview-ui/src/components/DialogHost';
import { InlineDiscussion } from '../../../webview-ui/src/tabs/preplanning/InlineDiscussion';
import { store } from '../../../webview-ui/src/store/store';

const WORKSPACE = { projectId: 'proj', branch: 'feature/x' };
const RESEARCH_TARGET = '7';
const posted: WebviewMessage[] = [];

function researchComment(): ReviewComment {
  return {
    id: 41, parent_id: null, scope: 'research', target: RESEARCH_TARGET, file_path: null, line_start: null, line_end: null, line_hash: null,
    text: 'check reservation expiry', author: 'user', type: 'research', created_at: '2026-11-09T10:00:00', resolved: false, resolved_at: null, resolution: null,
    replies: [{ id: 42, text: 'noted', author: 'agent', created_at: '2026-11-09T10:05:00', status: 'open', resolved_at: null }],
  } as ReviewComment;
}

function apiRequests(): { method: string; path: string; body?: unknown }[] {
  return posted
    .filter((message) => message.kind === 'request' && message.method === 'api.request')
    .map((message) => (message as { params: { method: string; path: string; body?: unknown } }).params);
}

function answerRequests(): void {
  posted.filter((message) => message.kind === 'request').forEach((message) => {
    window.dispatchEvent(new MessageEvent('message', { data: { kind: 'response', id: message.id, ok: true, result: { status: 200, body: { ok: true } } } }));
  });
}

function dialogConfirmButton(): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.gw-dialog-footer button')).find((button) => button.textContent === 'buttons.delete');
}

function renderEntry(): void {
  render(
    <>
      <InlineDiscussion scope="research" target={RESEARCH_TARGET} renderItem={(trigger) => <div>Inventory reservation handling{trigger}</div>} />
      <DialogHost />
    </>,
  );
  fireEvent.click(document.querySelector('.gw-pp-comment-trigger') as Element);
}

beforeEach(() => {
  posted.length = 0;
  vi.stubGlobal('acquireVsCodeApi', () => ({
    postMessage: (message: WebviewMessage) => posted.push(message),
    getState: () => undefined,
    setState: <T,>(state: T) => state,
  }));
  const state = { phase: '1.4', plan: {}, comments: { [`research:${RESEARCH_TARGET}`]: [researchComment()] } } as unknown as WorkspaceState;
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: WORKSPACE, state, etag: null } });
});

afterEach(() => {
  cleanup();
});

describe('InlineDiscussion', () => {
  it('open_shouldShowCountedCommentWithReplies_whenItemHasComments', () => {
    renderEntry();

    expect(document.querySelector('.gw-pp-comment-count')?.textContent).toBe('1');
    expect(screen.getByText('check reservation expiry')).toBeTruthy();
    expect(screen.getByText('noted')).toBeTruthy();
  });

  it('resolve_shouldPutResolvedTrue_forCountedComment', async () => {
    renderEntry();

    fireEvent.click(screen.getByText('vsc.common.resolve'));
    await waitFor(() => expect(apiRequests()).toHaveLength(1));

    expect(apiRequests()[0]).toMatchObject({ method: 'PUT', path: '/api/ws/proj/feature/x/comments/41/resolve', body: { resolved: true } });
  });

  it('delete_shouldRemoveRepliesThenRoot_afterConfirmation', async () => {
    renderEntry();

    fireEvent.click(screen.getByText('buttons.delete'));
    await waitFor(() => expect(dialogConfirmButton()).toBeTruthy());
    fireEvent.click(dialogConfirmButton() as HTMLButtonElement);
    await waitFor(() => expect(apiRequests()).toHaveLength(1));
    answerRequests();
    await waitFor(() => expect(apiRequests()).toHaveLength(2));

    expect(apiRequests().map((request) => `${request.method} ${request.path}`)).toEqual([
      'DELETE /api/ws/proj/feature/x/context/discussions/42',
      'DELETE /api/ws/proj/feature/x/context/discussions/41',
    ]);
  });
});
