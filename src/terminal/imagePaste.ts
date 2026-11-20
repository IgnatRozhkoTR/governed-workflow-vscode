import * as vscode from 'vscode';
import type { ClipboardImageRead } from './clientClipboard';
import { deliverImage, reportingApiErrors, type ImageDeliveryDeps } from './imageAttach';

export const PASTE_IMAGE_COMMAND = 'governedWorkflow.pasteImage';

// Claude Code's own image paste key (Ctrl+V) on the macOS or Linux host that runs it. Keybindings pass the input of
// the key they replaced, so this only applies when the command runs without one.
const CLAUDE_PASTE_KEY_INPUT = '\x16';
const CLIPBOARD_IMAGE_FILENAME = 'clipboard-image';
const UNAVAILABLE_MESSAGE_TIMEOUT_MS = 6000;

export interface ImagePasteDeps extends ImageDeliveryDeps {
  readonly readClipboardImage: () => Promise<ClipboardImageRead>;
}

export function registerImagePaste(context: vscode.ExtensionContext, deps: ImagePasteDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(PASTE_IMAGE_COMMAND, (options?: unknown) =>
      reportingApiErrors(() => pasteImage(deps, fallbackInputOf(options))),
    ),
  );
}

function fallbackInputOf(options: unknown): string {
  const fallbackInput = typeof options === 'object' && options !== null ? (options as { fallbackInput?: unknown }).fallbackInput : undefined;
  return typeof fallbackInput === 'string' ? fallbackInput : CLAUDE_PASTE_KEY_INPUT;
}

// Without an image on the user's clipboard the original key goes through, so Claude Code's own paste still runs.
async function pasteImage(deps: ImagePasteDeps, fallbackInput: string): Promise<void> {
  const session = deps.claude.activeSession();
  if (session === undefined) {
    await vscode.window.showInformationMessage('Focus the Claude terminal to paste an image into it.');
    return;
  }
  const read = await deps.readClipboardImage();
  session.terminal.show(false);
  if (read.kind === 'image') {
    await deliverImage(deps, session.ref, { ...read.image, filename: CLIPBOARD_IMAGE_FILENAME });
    return;
  }
  session.terminal.sendText(fallbackInput, false);
  if (read.kind === 'unavailable') {
    vscode.window.setStatusBarMessage(`Could not read this machine's clipboard (${read.reason}); sent the paste key to Claude.`, UNAVAILABLE_MESSAGE_TIMEOUT_MS);
  }
}
