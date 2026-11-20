import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { WorkspaceRef } from '../src/api/types';
import { ApiError } from '../src/api/errors';
import { parseReaderReply, type ClipboardImageRead } from '../src/terminal/clientClipboard';
import { PASTE_IMAGE_COMMAND, registerImagePaste } from '../src/terminal/imagePaste';

const REF = { projectId: 1, branch: 'feature/x' } as WorkspaceRef;
const PNG_BYTES = new Uint8Array([137, 80, 78, 71]);
const IMAGE_READ: ClipboardImageRead = { kind: 'image', image: { bytes: PNG_BYTES, mime: 'image/png' } };

const terminal = { show: vi.fn(), sendText: vi.fn() };
const client = { uploadPasteImage: vi.fn() };
const claude = { activeSession: vi.fn(), sendText: vi.fn(), terminalFor: vi.fn() };
const readClipboardImage = vi.fn<() => Promise<ClipboardImageRead>>();
let pasteImage: (options?: unknown) => Promise<void>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(vscode.commands.registerCommand).mockImplementation(((id: string, handler: never) => {
    if (id === PASTE_IMAGE_COMMAND) {
      pasteImage = handler;
    }
    return { dispose: vi.fn() };
  }) as never);
  claude.activeSession.mockReturnValue({ ref: REF, terminal });
  claude.sendText.mockReturnValue(true);
  registerImagePaste({ subscriptions: [] } as never, { client: client as never, claude: claude as never, readClipboardImage });
});

describe('governedWorkflow.pasteImage', () => {
  it('pasteImage_shouldUploadAndNotSendKey_whenServerPastesFromItsClipboard', async () => {
    readClipboardImage.mockResolvedValue(IMAGE_READ);
    client.uploadPasteImage.mockResolvedValue({ ok: true, mode: 'clipboard', path: '/w/.claude/state/pasted-images/a.png' });

    await pasteImage({ fallbackInput: '\x16' });

    expect(client.uploadPasteImage).toHaveBeenCalledWith(REF, PNG_BYTES, 'image/png', 'clipboard-image');
    expect(terminal.sendText).not.toHaveBeenCalled();
    expect(claude.sendText).not.toHaveBeenCalled();
    expect(terminal.show).toHaveBeenCalledWith(false);
  });

  it('pasteImage_shouldReferenceImageByPath_whenServerReturnsPathMode', async () => {
    readClipboardImage.mockResolvedValue(IMAGE_READ);
    client.uploadPasteImage.mockResolvedValue({ ok: true, mode: 'path', path: '/w/a.png' });

    await pasteImage({ fallbackInput: '\x16' });

    expect(claude.sendText).toHaveBeenCalledWith(REF, '@/w/a.png ');
    expect(terminal.sendText).not.toHaveBeenCalled();
  });

  it('pasteImage_shouldSendOriginalKey_whenClipboardHasNoImage', async () => {
    readClipboardImage.mockResolvedValue({ kind: 'none' });

    await pasteImage({ fallbackInput: '\x1bv' });

    expect(terminal.sendText).toHaveBeenCalledWith('\x1bv', false);
    expect(client.uploadPasteImage).not.toHaveBeenCalled();
    expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
  });

  it('pasteImage_shouldSendClaudePasteKey_whenNoFallbackIsGiven', async () => {
    readClipboardImage.mockResolvedValue({ kind: 'none' });

    await pasteImage();

    expect(terminal.sendText).toHaveBeenCalledWith('\x16', false);
  });

  it('pasteImage_shouldSendOriginalKeyAndReport_whenClipboardIsUnreadable', async () => {
    readClipboardImage.mockResolvedValue({ kind: 'unavailable', reason: 'Document is not focused.' });

    await pasteImage({ fallbackInput: '\x16' });

    expect(terminal.sendText).toHaveBeenCalledWith('\x16', false);
    expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(expect.stringContaining('Document is not focused.'), expect.any(Number));
  });

  it('pasteImage_shouldShowError_whenUploadFails', async () => {
    readClipboardImage.mockResolvedValue(IMAGE_READ);
    client.uploadPasteImage.mockRejectedValue(new ApiError(500, 'server_error', 'disk full'));

    await pasteImage({ fallbackInput: '\x16' });

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('disk full');
    expect(terminal.sendText).not.toHaveBeenCalled();
  });

  it('pasteImage_shouldNotReadClipboard_whenNoClaudeTerminalIsActive', async () => {
    claude.activeSession.mockReturnValue(undefined);

    await pasteImage({ fallbackInput: '\x16' });

    expect(readClipboardImage).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalled();
  });
});

describe('parseReaderReply', () => {
  it('parseReaderReply_shouldDecodeBase64Image_whenReplyHasImage', () => {
    const read = parseReaderReply({ kind: 'image', mime: 'image/png', base64: Buffer.from(PNG_BYTES).toString('base64') });

    expect(read).toEqual({ kind: 'image', image: { bytes: Buffer.from(PNG_BYTES), mime: 'image/png' } });
  });

  it('parseReaderReply_shouldReturnNone_whenReplyHasNoImage', () => {
    expect(parseReaderReply({ kind: 'none' })).toEqual({ kind: 'none' });
  });

  it('parseReaderReply_shouldKeepReason_whenReaderReportsUnavailable', () => {
    expect(parseReaderReply({ kind: 'unavailable', reason: 'denied' })).toEqual({ kind: 'unavailable', reason: 'denied' });
  });

  it.each([
    ['a non-object', 'image'],
    ['a non-image mime', { kind: 'image', mime: 'text/html', base64: 'AA==' }],
    ['a missing payload', { kind: 'image', mime: 'image/png' }],
    ['an unknown kind', { kind: 'text' }],
  ])('parseReaderReply_shouldReturnUnavailable_whenReplyIs %s', (_label, reply) => {
    expect(parseReaderReply(reply).kind).toBe('unavailable');
  });
});
