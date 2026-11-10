// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadView, type ThreadMessage, type ThreadViewProps } from '../webview-ui/src/components/ThreadView';
import { toasts } from '../webview-ui/src/components/ToastHost';

const ROOT: ThreadMessage = { id: 1, author: 'user', text: 'root text', createdAt: '2026-11-09T10:00:00' };
const REPLY: ThreadMessage = { id: 2, author: 'claude', text: 'reply text', createdAt: '2026-11-09T10:05:00' };

function renderThread(overrides: Partial<ThreadViewProps> = {}): void {
  render(<ThreadView root={ROOT} replies={[REPLY]} resolved={false} {...overrides} />);
}

function replyInput(): HTMLTextAreaElement {
  return document.querySelector('.gw-thread-reply textarea') as HTMLTextAreaElement;
}

function openReply(): void {
  fireEvent.click(screen.getByText('buttons.reply'));
}

function typeReply(text: string): void {
  fireEvent.input(replyInput(), { target: { value: text } });
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(toasts, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  errorSpy.mockRestore();
});

describe('ThreadView', () => {
  it('render_shouldShowRootAndRepliesWithAuthors', () => {
    renderThread();

    expect(screen.getByText('root text')).toBeTruthy();
    expect(screen.getByText('reply text')).toBeTruthy();
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
  });

  it('reply_shouldCallOnReplyWithTrimmedText_andClearDraft', async () => {
    const onReply = vi.fn(async () => undefined);
    renderThread({ onReply });
    openReply();

    typeReply('  looks good  ');
    fireEvent.click(screen.getByText('buttons.reply'));

    await waitFor(() => expect(onReply).toHaveBeenCalledWith('looks good'));
  });

  it('reply_shouldSubmitOnEnter', async () => {
    const onReply = vi.fn(async () => undefined);
    renderThread({ onReply });
    openReply();

    typeReply('via enter');
    fireEvent.keyDown(replyInput(), { key: 'Enter' });

    await waitFor(() => expect(onReply).toHaveBeenCalledWith('via enter'));
  });

  it('reply_shouldNotSubmit_whenDraftIsBlank', () => {
    const onReply = vi.fn(async () => undefined);
    renderThread({ onReply });
    openReply();

    typeReply('   ');
    fireEvent.keyDown(replyInput(), { key: 'Enter' });

    expect(onReply).not.toHaveBeenCalled();
    expect((screen.getByText('buttons.reply').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('reply_shouldKeepDraftAndShowErrorToast_whenOnReplyRejects', async () => {
    const failure = new Error('network down');
    renderThread({ onReply: vi.fn(async () => { throw failure; }) });
    openReply();

    typeReply('keep me');
    fireEvent.keyDown(replyInput(), { key: 'Enter' });

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(failure));
    expect(replyInput().value).toBe('keep me');
  });

  it('render_shouldHideReplyBox_whenThreadIsResolved', () => {
    renderThread({ resolved: true, onReply: vi.fn(async () => undefined) });

    expect(document.querySelector('.gw-thread-reply')).toBeNull();
  });

  it('render_shouldShowReplyButtonInsteadOfBox_untilReplyIsClicked', () => {
    renderThread({ onReply: vi.fn(async () => undefined) });

    expect(document.querySelector('.gw-thread-reply')).toBeNull();
    openReply();

    expect(replyInput()).toBeTruthy();
    expect(document.activeElement).toBe(replyInput());
  });

  it('escape_shouldCollapseReplyBox_andReturnFocusToReplyButton', () => {
    renderThread({ onReply: vi.fn(async () => undefined) });
    openReply();

    fireEvent.keyDown(replyInput(), { key: 'Escape' });

    expect(document.querySelector('.gw-thread-reply')).toBeNull();
    expect(document.activeElement).toBe(screen.getByText('buttons.reply').closest('button'));
  });

  it('reply_shouldCollapseReplyBox_afterSuccessfulSend', async () => {
    renderThread({ onReply: vi.fn(async () => undefined) });
    openReply();

    typeReply('done');
    fireEvent.keyDown(replyInput(), { key: 'Enter' });

    await waitFor(() => expect(document.querySelector('.gw-thread-reply')).toBeNull());
  });

  it('render_shouldHideReplyBox_whenNoReplyHandlerIsGiven', () => {
    renderThread();

    expect(document.querySelector('.gw-thread-reply')).toBeNull();
  });

  it('resolve_shouldCallToggleWithTrue_whenThreadIsOpen', async () => {
    const onToggleResolved = vi.fn(async () => undefined);
    renderThread({ onToggleResolved });

    fireEvent.click(screen.getByText('vsc.common.resolve'));

    await waitFor(() => expect(onToggleResolved).toHaveBeenCalledWith(true));
  });

  it('unresolve_shouldCallToggleWithFalse_whenThreadIsResolved', async () => {
    const onToggleResolved = vi.fn(async () => undefined);
    renderThread({ resolved: true, onToggleResolved });

    fireEvent.click(screen.getByText('buttons.unresolve'));

    await waitFor(() => expect(onToggleResolved).toHaveBeenCalledWith(false));
  });

  it('resolve_shouldShowErrorToast_whenToggleRejects', async () => {
    const failure = new Error('forbidden');
    renderThread({ onToggleResolved: vi.fn(async () => { throw failure; }) });

    fireEvent.click(screen.getByText('vsc.common.resolve'));

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(failure));
  });

  it('render_shouldOmitResolveButton_whenNoToggleHandlerIsGiven', () => {
    renderThread();

    expect(screen.queryByText('vsc.common.resolve')).toBeNull();
  });

  it('render_shouldCollapseRepliesOfResolvedThread_andExpandOnToggle', () => {
    renderThread({ resolved: true, collapsedWhenResolved: true });
    expect(screen.queryByText('reply text')).toBeNull();

    fireEvent.click(document.querySelector('.gw-thread button[title="root text"]') as Element);

    expect(screen.getByText('reply text')).toBeTruthy();
  });

  it('render_shouldShowRepliesOfResolvedThread_whenCollapsingIsNotRequested', () => {
    renderThread({ resolved: true });

    expect(screen.getByText('reply text')).toBeTruthy();
  });
});
