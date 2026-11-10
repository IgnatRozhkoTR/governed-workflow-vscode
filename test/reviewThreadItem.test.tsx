// @vitest-environment happy-dom
import type { ReviewComment } from '@api-types';
import type { WebviewMessage } from '@shared/protocol';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewThreadItem } from '../webview-ui/src/tabs/review/ReviewThreadItem';

const posted: WebviewMessage[] = [];

function fileLevelComment(overrides: Partial<ReviewComment>): ReviewComment {
  return {
    id: 7, parent_id: null, scope: 'code', target: 'src/old', file_path: null, line_start: null, line_end: null, line_hash: null,
    text: 'comment', author: 'user', type: null, created_at: '2026-11-09T10:00:00', resolved: false, resolved_at: null, resolution: null, replies: [],
    ...overrides,
  };
}

beforeEach(() => {
  posted.length = 0;
  vi.stubGlobal('acquireVsCodeApi', () => ({
    postMessage: (message: WebviewMessage) => posted.push(message),
    getState: () => undefined,
    setState: <T,>(state: T) => state,
  }));
});

afterEach(cleanup);

describe('ReviewThreadItem file-level target', () => {
  it('click_shouldRequestNativeThreadReveal_whenCommentHasOnlyTarget', () => {
    render(<ReviewThreadItem comment={fileLevelComment({})} />);

    fireEvent.click(document.querySelector('button[title="src/old"]') as HTMLButtonElement);

    expect(posted).toContainEqual(expect.objectContaining({ kind: 'request', method: 'native.revealCommentThread', params: { commentId: 7 } }));
  });

  it('click_shouldOpenFile_whenCommentHasFilePath', () => {
    render(<ReviewThreadItem comment={fileLevelComment({ file_path: 'src/a.ts' })} />);

    fireEvent.click(document.querySelector('button[title="src/a.ts"]') as HTMLButtonElement);

    expect(posted).toContainEqual(expect.objectContaining({ method: 'native.openFile' }));
  });
});
