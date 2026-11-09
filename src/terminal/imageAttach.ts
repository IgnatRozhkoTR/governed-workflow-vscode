import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { WorkspaceRef } from '../api/types';
import { unwrapRef, type RefArgument } from '../commands/refArgument';
import type { ClaudeTerminalHandle } from './claudeTerminal';

export const ATTACH_IMAGE_COMMAND = 'governedWorkflow.attachImage';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};
const CLIPBOARD_MODE = 'clipboard';

export interface ImageAttachDeps {
  readonly client: ApiClient;
  readonly activeWorkspace: { readonly workspace: WorkspaceRef | undefined };
  readonly claude: ClaudeTerminalHandle;
}

export function registerImageAttach(context: vscode.ExtensionContext, deps: ImageAttachDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(ATTACH_IMAGE_COMMAND, async (arg?: RefArgument) => {
      try {
        await attachImage(deps, unwrapRef(arg) ?? deps.activeWorkspace.workspace);
      } catch (error) {
        if (!(error instanceof ApiError)) {
          throw error;
        }
        await vscode.window.showErrorMessage(error.message);
      }
    }),
  );
}

async function attachImage(deps: ImageAttachDeps, ref: WorkspaceRef | undefined): Promise<void> {
  if (ref === undefined) {
    await vscode.window.showInformationMessage('Select a workspace first.');
    return;
  }
  const [file] = (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Images: IMAGE_EXTENSIONS } })) ?? [];
  if (file === undefined) {
    return;
  }
  const bytes = await vscode.workspace.fs.readFile(file);
  const filename = path.basename(file.fsPath);
  const mime = MIME_BY_EXTENSION[path.extname(filename).slice(1).toLowerCase()] ?? 'image/png';
  const result = await deps.client.uploadPasteImage(ref, bytes, mime, filename);
  if (result.mode === CLIPBOARD_MODE) {
    await vscode.window.showInformationMessage('Image pasted into the Claude session.');
    return;
  }
  if (!deps.claude.sendText(ref, `@${result.path} `)) {
    await vscode.window.showInformationMessage(`Image saved at ${result.path}. Open the Claude terminal and reference it with @.`);
  }
}
