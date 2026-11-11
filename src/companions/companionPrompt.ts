import * as vscode from 'vscode';
import type { CompanionPromptMemory } from './companionPromptMemory';
import type { Companion, CompanionTrigger } from './companionRegistry';

const INSTALL_ACTION = 'Install';
const NOT_NOW_ACTION = 'Not now';
const DONT_ASK_AGAIN_ACTION = "Don't ask again";
const INSTALL_EXTENSION_COMMAND = 'workbench.extensions.installExtension';

export async function offerCompanion(
  companion: Companion,
  trigger: CompanionTrigger,
  memory: CompanionPromptMemory,
  reason = companion.reason,
): Promise<boolean> {
  if (!memory.shouldPrompt(companion.id, trigger)) {
    return false;
  }
  memory.markPrompted(companion.id, trigger);
  const choice = await vscode.window.showInformationMessage(
    `Install the ${companion.displayName} extension? ${reason}`,
    INSTALL_ACTION,
    NOT_NOW_ACTION,
    DONT_ASK_AGAIN_ACTION,
  );
  if (choice === INSTALL_ACTION) {
    await installCompanion(companion);
    return true;
  }
  if (choice === DONT_ASK_AGAIN_ACTION) {
    await memory.decline(companion.id);
  }
  return false;
}

export async function installCompanion(companion: Companion): Promise<void> {
  await vscode.commands.executeCommand(INSTALL_EXTENSION_COMMAND, companion.id);
}
