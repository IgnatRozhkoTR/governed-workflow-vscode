// @vitest-environment happy-dom
import type { FileSnippet, ReviewComment } from '@api-types';
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lineHash } from '../../../src/comments/lineHash';
import { getFileSnippet } from '../../../webview-ui/src/api/core';
import { ReviewThreadItem } from '../../../webview-ui/src/tabs/review/ReviewThreadItem';

vi.mock('../../../webview-ui/src/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../webview-ui/src/api/core')>()),
  getFileSnippet: vi.fn(),
}));

const PADDED_SNIPPET: FileSnippet = {
  path: 'app/discounts.py',
  lines: ['l15', 'l16', 'l17', 'l18', 'l19', 'anchored line', 'l21'],
  total_lines: 40,
  start: 15,
  end: 21,
};

function reviewComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: 7, parent_id: null, scope: 'review', target: 'app/discounts.py', file_path: 'app/discounts.py', line_start: 20, line_end: 20,
    line_hash: lineHash('anchored line'), text: 'Check this', author: 'user', type: null, created_at: '2026-11-09T10:00:00',
    resolved: false, resolved_at: null, resolution: 'open', replies: [], ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getFileSnippet).mockResolvedValue(PADDED_SNIPPET);
});

afterEach(() => {
  cleanup();
  vi.mocked(getFileSnippet).mockReset();
});

describe('ReviewThreadItem outdated marker', () => {
  it('render_shouldNotMarkOutdated_whenHashMatchesAnchoredLineOfPaddedSnippet', async () => {
    render(<ReviewThreadItem comment={reviewComment()} />);

    await waitFor(() => expect(getFileSnippet).toHaveBeenCalledWith('app/discounts.py', 20, 20));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Comments.outdated')).toBeNull();
  });

  it('render_shouldMarkOutdated_whenAnchoredLineHashDiffers', async () => {
    render(<ReviewThreadItem comment={reviewComment({ line_hash: lineHash('previous text') })} />);

    await waitFor(() => expect(screen.getByText('Comments.outdated')).toBeTruthy());
  });
});

describe('ReviewThreadItem location', () => {
  it('render_shouldOfferQuote_whenCommentIsOnLines', () => {
    render(<ReviewThreadItem comment={reviewComment()} />);

    expect(screen.getByText('research.showQuote')).toBeTruthy();
  });

  it('render_shouldShowTargetWithoutQuote_whenCommentHasNoFilePath', () => {
    render(<ReviewThreadItem comment={reviewComment({ file_path: null, line_start: null, line_end: null, line_hash: null, target: 'qa-api/app' })} />);

    expect(screen.queryByText('research.showQuote')).toBeNull();
    expect(screen.getByText('qa-api/app').closest('button')?.classList.contains('gw-link')).toBe(true);
  });

  it('render_shouldOmitQuote_whenCommentIsOnWholeFile', () => {
    render(<ReviewThreadItem comment={reviewComment({ line_start: null, line_end: null, line_hash: null })} />);

    expect(screen.queryByText('research.showQuote')).toBeNull();
    expect(screen.getByText('app/discounts.py')).toBeTruthy();
  });
});

describe('ReviewThreadItem severity and reply', () => {
  it('render_shouldShowSeverityBadgeAndStripPrefix_whenTextStartsWithSeverity', () => {
    render(<ReviewThreadItem comment={reviewComment({ text: '[critical] Missing auth check' })} />);

    expect(screen.getByText('vsc.review.severity.critical')).toBeTruthy();
    expect(screen.getByText('Missing auth check')).toBeTruthy();
  });

  it('render_shouldCollapseReplyBox_untilReplyIsClicked', () => {
    render(<ReviewThreadItem comment={reviewComment()} />);

    expect(document.querySelector('.gw-thread-reply')).toBeNull();
    expect(screen.getByText('buttons.reply')).toBeTruthy();
  });
});
