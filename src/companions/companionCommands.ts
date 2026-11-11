import * as vscode from 'vscode';
import type { Settings } from '../config/settings';
import { installCompanion, offerCompanion } from './companionPrompt';
import type { CompanionPromptMemory } from './companionPromptMemory';
import {
  COMPANIONS,
  REMOTE_SSH,
  REMOTE_SSH_CONNECT_COMMAND,
  companionPresence,
  type Companion,
  type CompanionEnvironment,
  type CompanionPresence,
} from './companionRegistry';

export const COMPANION_COMMAND_IDS = {
  companions: 'governedWorkflow.companions',
  workWithAnotherMachine: 'governedWorkflow.workWithAnotherMachine',
} as const;

const OPEN_EXTENSION_COMMAND = 'extension.open';

const PRESENCE_LABELS: Readonly<Record<CompanionPresence, string>> = {
  installed: 'installed',
  missing: 'not installed',
  unknown: 'cannot be checked from this remote window',
};

const PRESENCE_ICONS: Readonly<Record<CompanionPresence, string>> = {
  installed: '$(check)',
  missing: '$(cloud-download)',
  unknown: '$(question)',
};

export interface CompanionDeps {
  readonly settings: Settings;
  readonly memory: CompanionPromptMemory;
}

export function registerCompanions(context: vscode.ExtensionContext, deps: CompanionDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMPANION_COMMAND_IDS.companions, () => pickCompanion(deps)),
    vscode.commands.registerCommand(COMPANION_COMMAND_IDS.workWithAnotherMachine, () => workWithAnotherMachine(deps)),
    deps.settings.onDidChange(() => offerNeededCompanions(deps)),
  );
  offerNeededCompanions(deps);
}

function offerNeededCompanions(deps: CompanionDeps): void {
  const environment = currentEnvironment(deps);
  COMPANIONS.filter((companion) => companion.isNeeded(environment) && presenceOf(companion, environment) === 'missing').forEach(
    (companion) => void offerCompanion(companion, 'environment', deps.memory),
  );
}

async function workWithAnotherMachine(deps: CompanionDeps): Promise<void> {
  if (presenceOf(REMOTE_SSH, currentEnvironment(deps)) === 'missing') {
    await offerCompanion(REMOTE_SSH, 'command', deps.memory);
    return;
  }
  await vscode.commands.executeCommand(REMOTE_SSH_CONNECT_COMMAND);
}

async function pickCompanion(deps: CompanionDeps): Promise<void> {
  const environment = currentEnvironment(deps);
  const items = COMPANIONS.map((companion) => toQuickPickItem(companion, presenceOf(companion, environment)));
  const picked = await vscode.window.showQuickPick(items, { title: 'Governed Workflow Companions', placeHolder: 'Pick a companion to install or open' });
  if (picked === undefined) {
    return;
  }
  if (picked.presence === 'installed') {
    await vscode.commands.executeCommand(OPEN_EXTENSION_COMMAND, picked.companion.id);
    return;
  }
  await installCompanion(picked.companion);
}

interface CompanionQuickPickItem extends vscode.QuickPickItem {
  readonly companion: Companion;
  readonly presence: CompanionPresence;
}

function toQuickPickItem(companion: Companion, presence: CompanionPresence): CompanionQuickPickItem {
  return {
    label: `${PRESENCE_ICONS[presence]} ${companion.displayName}`,
    description: PRESENCE_LABELS[presence],
    detail: companion.reason,
    companion,
    presence,
  };
}

function currentEnvironment(deps: CompanionDeps): CompanionEnvironment {
  return { serverUrl: deps.settings.serverUrl, remoteName: vscode.env.remoteName };
}

function presenceOf(companion: Companion, environment: CompanionEnvironment): CompanionPresence {
  return companionPresence(companion, environment, (id) => vscode.extensions.getExtension(id) !== undefined);
}
