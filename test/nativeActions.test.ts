import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createNativeHandlers } from '../src/webview/nativeActions';
import { RpcHandlerError } from '../src/webview/rpcHost';
import type { NativeActionDeps } from '../src/webview/nativeActions';
import { Uri } from './vscodeStub';

const handlers = createNativeHandlers({} as NativeActionDeps);
const saveDialog = vi.mocked(vscode.window.showSaveDialog);
const writeFile = vi.mocked(vscode.workspace.fs.writeFile);

beforeEach(() => {
  saveDialog.mockReset();
  writeFile.mockReset();
  vscode.workspace.workspaceFolders = [{ uri: Uri.file('/repo') }];
});

describe('native.saveFile', () => {
  it('saveFile_shouldWriteUtf8ContentAndReportSaved_whenUserPicksTarget', async () => {
    saveDialog.mockResolvedValue(Uri.file('/chosen/plan.md'));

    const result = await handlers['native.saveFile']({ suggestedName: 'plan.md', content: 'héllo' });

    expect(result).toEqual({ saved: true });
    expect(writeFile).toHaveBeenCalledOnce();
    const [target, bytes] = writeFile.mock.calls[0];
    expect(target.toString()).toBe('file:/chosen/plan.md');
    expect(new TextDecoder().decode(bytes as Uint8Array)).toBe('héllo');
  });

  it('saveFile_shouldReportNotSavedWithoutError_whenUserCancelsDialog', async () => {
    saveDialog.mockResolvedValue(undefined);

    const result = await handlers['native.saveFile']({ suggestedName: 'plan.md', content: 'x' });

    expect(result).toEqual({ saved: false });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('saveFile_shouldOfferWorkspaceFolderAsDefaultLocation', async () => {
    saveDialog.mockResolvedValue(undefined);

    await handlers['native.saveFile']({ suggestedName: 'plan.md', content: 'x' });

    expect(saveDialog.mock.calls[0][0]?.defaultUri?.toString()).toBe('file:/repo/plan.md');
  });

  it('saveFile_shouldStripDirectoriesFromSuggestedName', async () => {
    saveDialog.mockResolvedValue(undefined);

    await handlers['native.saveFile']({ suggestedName: '../../etc/passwd', content: 'x' });

    expect(saveDialog.mock.calls[0][0]?.defaultUri?.toString()).toBe('file:/repo/passwd');
  });

  it('saveFile_shouldAllowEmptyContent', async () => {
    saveDialog.mockResolvedValue(Uri.file('/chosen/empty.txt'));

    const result = await handlers['native.saveFile']({ suggestedName: 'empty.txt', content: '' });

    expect(result).toEqual({ saved: true });
  });

  it('saveFile_shouldRejectWithNativeFailed_whenSuggestedNameIsEmpty', async () => {
    await expect(handlers['native.saveFile']({ suggestedName: '', content: 'x' })).rejects.toMatchObject({
      name: 'RpcHandlerError',
      code: 'native_failed',
    });
    expect(saveDialog).not.toHaveBeenCalled();
  });

  it('saveFile_shouldRejectWithNativeFailed_whenContentIsNotString', async () => {
    const args = { suggestedName: 'a.md', content: 5 } as unknown as { suggestedName: string; content: string };

    await expect(handlers['native.saveFile'](args)).rejects.toBeInstanceOf(RpcHandlerError);
  });

  it('saveFile_shouldWrapWriteFailureAsNativeFailed', async () => {
    saveDialog.mockResolvedValue(Uri.file('/chosen/a.md'));
    writeFile.mockRejectedValue(new Error('disk full'));

    await expect(handlers['native.saveFile']({ suggestedName: 'a.md', content: 'x' })).rejects.toMatchObject({
      code: 'native_failed',
      message: 'disk full',
    });
  });
});

describe('native.openExternal', () => {
  it('openExternal_shouldRejectNonHttpSchemes', async () => {
    await expect(handlers['native.openExternal']({ url: 'file:///etc/passwd' })).rejects.toMatchObject({ code: 'native_failed' });
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
  });
});

describe('native.copyText', () => {
  it('copyText_shouldWriteTextToClipboard', async () => {
    await handlers['native.copyText']({ text: 'abc' });

    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('abc');
  });

  it('copyText_shouldRejectEmptyText', async () => {
    await expect(handlers['native.copyText']({ text: '' })).rejects.toMatchObject({ code: 'native_failed' });
  });
});
