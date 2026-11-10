// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReviewComment, WorkspaceState } from '@api-types';
import type { WebviewMessage } from '@shared/protocol';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Commentable } from '../webview-ui/src/components/Commentable';
import { store } from '../webview-ui/src/store/store';

const WORKSPACE = { projectId: 'proj', branch: 'feature/x' };
const posted: WebviewMessage[] = [];

function comment(id: number, resolved: boolean): ReviewComment {
  return {
    id, parent_id: null, scope: 'plan', target: 'Task: Build', file_path: null, line_start: null, line_end: null, line_hash: null,
    text: `comment ${id}`, author: 'user', type: null, created_at: '2026-11-09T10:00:00', resolved, resolved_at: null, resolution: null, replies: [],
  };
}

function loadState(comments: Record<string, ReviewComment[]>): void {
  const state = { phase: '3.1.0', plan: {}, comments } as unknown as WorkspaceState;
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: WORKSPACE, state, etag: null } });
}

function answerRequests(): void {
  posted.filter((message) => message.kind === 'request').forEach((message) => {
    window.dispatchEvent(new MessageEvent('message', { data: { kind: 'response', id: message.id, ok: true, result: { status: 201, body: { id: 99 } } } }));
  });
}

beforeEach(() => {
  posted.length = 0;
  vi.stubGlobal('acquireVsCodeApi', () => ({
    postMessage: (message: WebviewMessage) => posted.push(message),
    getState: () => undefined,
    setState: <T,>(state: T) => state,
  }));
  loadState({ 'plan:Task: Build': [comment(1, false), comment(2, true)] });
});

afterEach(() => {
  cleanup();
});

describe('Commentable', () => {
  it('render_shouldShowOpenCommentCount_whenTargetHasComments', () => {
    render(<Commentable scope="plan" target="Task: Build"><span>Build</span></Commentable>);

    expect(screen.getByText('Build')).toBeTruthy();
    expect(document.querySelector('.gw-comment-count')?.textContent).toBe('1');
  });

  it('render_shouldNameButtonWithOpenCount_whenTargetHasComments', () => {
    render(<Commentable scope="plan" target="Task: Build"><span>Build</span></Commentable>);

    expect(document.querySelector('.gw-comment-icon')?.getAttribute('aria-label')).toBe('comments.title (1)');
  });

  it('render_shouldNameButtonAsAddComment_whenTargetHasNoOpenComments', () => {
    render(<Commentable scope="plan" target="Other"><span>Other</span></Commentable>);

    expect(document.querySelector('.gw-comment-icon')?.getAttribute('aria-label')).toBe('comments.addComment');
  });

  it('click_shouldOpenInlineThreadWithExistingComments', () => {
    render(<Commentable scope="plan" target="Task: Build"><span>Build</span></Commentable>);

    fireEvent.click(document.querySelector('.gw-comment-icon') as Element);

    expect(screen.getByText('comment 1')).toBeTruthy();
    expect(screen.getByText('comment 2')).toBeTruthy();
  });

  it('save_shouldPostCommentThroughRpc_withScopeAndTarget', async () => {
    render(<Commentable scope="plan" target="Task: Build"><span>Build</span></Commentable>);
    fireEvent.click(document.querySelector('.gw-comment-icon') as Element);
    const input = document.querySelector('.gw-comment-new textarea') as HTMLTextAreaElement;

    fireEvent.input(input, { target: { value: 'please split this task' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(posted.some((message) => message.kind === 'request' && message.method === 'api.request')).toBe(true));
    const request = posted.find((message) => message.kind === 'request' && message.method === 'api.request');
    expect(request).toMatchObject({
      params: { method: 'POST', path: '/api/ws/proj/feature/x/comments', body: { scope: 'plan', target: 'Task: Build', text: 'please split this task' } },
    });
    answerRequests();
  });

  it('stateEvent_shouldUpdateBadge_whenCommentsChange', async () => {
    render(<Commentable scope="plan" target="Task: Build"><span>Build</span></Commentable>);

    loadState({ 'plan:Task: Build': [comment(1, false), comment(3, false)] });

    await waitFor(() => expect(document.querySelector('.gw-comment-count')?.textContent).toBe('2'));
  });
});

describe('Commentable thread mutations', () => {
  function openThread(): void {
    render(<Commentable scope="plan" target="Task: Build"><span>Build</span></Commentable>);
    fireEvent.click(document.querySelector('.gw-comment-icon') as Element);
  }

  function apiRequests(): { method: string; path: string; body?: unknown }[] {
    return posted
      .filter((message) => message.kind === 'request' && message.method === 'api.request')
      .map((message) => (message as { params: { method: string; path: string; body?: unknown } }).params);
  }

  it('reply_shouldPostToReplyEndpoint_andRefreshState', async () => {
    openThread();
    fireEvent.click(screen.getByText('buttons.reply'));
    const input = document.querySelector('.gw-thread-reply textarea') as HTMLTextAreaElement;

    fireEvent.input(input, { target: { value: 'agreed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(apiRequests()).toHaveLength(1));
    answerRequests();

    expect(apiRequests()[0]).toMatchObject({ method: 'POST', path: '/api/ws/proj/feature/x/comments/1/reply', body: { text: 'agreed' } });
    await waitFor(() => expect(posted.some((message) => message.kind === 'request' && message.method === 'state.refresh')).toBe(true));
  });

  it('resolve_shouldPutResolvedTrue_forOpenThread', async () => {
    openThread();

    fireEvent.click(screen.getByText('vsc.common.resolve'));
    await waitFor(() => expect(apiRequests()).toHaveLength(1));
    answerRequests();

    expect(apiRequests()[0]).toMatchObject({ method: 'PUT', path: '/api/ws/proj/feature/x/comments/1/resolve', body: { resolved: true } });
  });

  it('unresolve_shouldPutResolvedFalse_forResolvedThread', async () => {
    openThread();

    fireEvent.click(screen.getByText('buttons.unresolve'));
    await waitFor(() => expect(apiRequests()).toHaveLength(1));
    answerRequests();

    expect(apiRequests()[0]).toMatchObject({ method: 'PUT', path: '/api/ws/proj/feature/x/comments/2/resolve', body: { resolved: false } });
  });
});

describe('Commentable idle affordance', () => {
  const css = readFileSync(resolve(__dirname, '../webview-ui/src/styles/components.css'), 'utf8');

  it('render_shouldKeepAddButtonFocusableButUnpinned_whenTargetHasNoComments', () => {
    render(<Commentable scope="plan" target="Other"><span>Other</span></Commentable>);

    const button = document.querySelector('.gw-comment-icon') as HTMLButtonElement;
    button.focus();

    expect(document.querySelector('.gw-commentable-pinned')).toBeNull();
    expect(document.querySelector('.gw-comment-count')).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.tabIndex).toBe(0);
  });

  it('render_shouldPinAffordanceWithCount_whenTargetHasComments', () => {
    render(<Commentable scope="plan" target="Task: Build"><span>Build</span></Commentable>);

    expect(document.querySelector('.gw-commentable-pinned')).not.toBeNull();
    expect(document.querySelector('.gw-comment-count')?.textContent).toBe('1');
  });

  it('stylesheet_shouldShowIdleCommentIconFaint_andRevealItOnHoverFocusAndTouch', () => {
    expect(css).toMatch(/:where\(\.gw-comment-icon:not\([^)]*\)\) \{ opacity: 0\.4;/);
    expect(css).not.toMatch(/\.gw-commentable-affordance \{[^}]*(display: none|opacity: 0)/);
    expect(css).toContain('.gw-comment-icon:focus-visible');
    expect(css).toMatch(/\.gw-commentable\):focus-within \.gw-comment-icon \{ opacity: 1; \}/);
    expect(css).toMatch(/@media \(hover: none\), \(pointer: coarse\) \{\s*:where\(\.gw-comment-icon[^}]*opacity: 1;/);
  });
});
