import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import { PROJECT_COMMAND_IDS, registerProjectCommands, type ProjectCommandDeps } from '../src/commands/projectCommands';
import { openSocketTerminal } from '../src/terminal/terminalSessions';

vi.mock('../src/terminal/terminalSessions', () => ({ openSocketTerminal: vi.fn() }));
vi.mock('../src/views/projectsTree', () => ({ SHOW_ARCHIVED_CONTEXT_KEY: 'governedWorkflow.showArchived' }));

const quickPick = vi.mocked(vscode.window.showQuickPick);
const inputBox = vi.mocked(vscode.window.showInputBox);

const client = {
  listSetupModules: vi.fn(),
  listVerificationProfiles: vi.fn(),
  listEnabledModules: vi.fn(),
  setupStart: vi.fn(),
  setupSocketUrl: vi.fn(),
};

type Step = 'add' | 'continue';
type PickItem = { id?: string | number; step?: Step; label: string; description?: string };

function pickModules(ids: string[]) {
  return async (items: PickItem[]) => items.filter((item) => ids.includes(item.id as string));
}

function pickLanguages(ids: number[]) {
  return async (items: PickItem[]) => items.filter((item) => ids.includes(item.id as number));
}

function pickStep(step: Step | undefined) {
  return async (items: PickItem[]) => items.find((item) => item.step === step);
}

function queueQuickPicks(...answers: ((items: PickItem[]) => Promise<unknown>)[]): void {
  answers.forEach((answer) => quickPick.mockImplementationOnce(((items: PickItem[]) => answer(items)) as never));
}

async function runSetup(): Promise<void> {
  const registered = vi.mocked(vscode.commands.registerCommand).mock.calls.find(([id]) => id === PROJECT_COMMAND_IDS.runProjectSetup);
  await (registered?.[1] as () => Promise<void>)();
}

beforeEach(() => {
  vi.clearAllMocks();
  quickPick.mockReset();
  inputBox.mockReset();
  client.listSetupModules.mockResolvedValue([{ id: 'git', name: 'Git', description: 'git hooks' }, { id: 'lint', name: 'Lint', description: 'linters' }]);
  client.listVerificationProfiles.mockResolvedValue([{ id: 7, name: 'Python', language: 'python' }, { id: 8, name: 'Java' }]);
  client.listEnabledModules.mockResolvedValue(['git']);
  client.setupStart.mockResolvedValue(undefined);
  client.setupSocketUrl.mockResolvedValue('ws://host/setup');
  registerProjectCommands({ subscriptions: [] } as unknown as ExtensionContext, { client } as unknown as ProjectCommandDeps);
});

describe('runProjectSetup custom profile flow', () => {
  it('runProjectSetup_shouldStartSetupWithoutCustomLanguages_whenUserContinuesImmediately', async () => {
    queueQuickPicks(pickModules(['git', 'lint']), pickLanguages([7]), pickStep('continue'));

    await runSetup();

    expect(client.setupStart).toHaveBeenCalledWith({ modules: ['git', 'lint'], languages: [7], custom_languages: [] });
    expect(openSocketTerminal).toHaveBeenCalledWith('Project setup', 'ws://host/setup');
  });

  it('runProjectSetup_shouldPreselectEnabledModules', async () => {
    queueQuickPicks(async () => undefined);

    await runSetup();

    const items = quickPick.mock.calls[0][0] as unknown as { id: string; picked: boolean }[];
    expect(items.map((item) => [item.id, item.picked])).toEqual([['git', true], ['lint', false]]);
  });

  it('runProjectSetup_shouldSendTrimmedCustomLanguage_whenUserAddsOneProfile', async () => {
    queueQuickPicks(pickModules(['git']), pickLanguages([]), pickStep('add'), pickStep('continue'));
    inputBox.mockResolvedValueOnce('  Rust ').mockResolvedValueOnce(' Cargo').mockResolvedValueOnce('clippy, rustfmt ');

    await runSetup();

    expect(client.setupStart).toHaveBeenCalledWith({
      modules: ['git'],
      languages: [],
      custom_languages: [{ name: 'Rust', config: 'Cargo', details: 'clippy, rustfmt' }],
    });
  });

  it('runProjectSetup_shouldCollectSeveralCustomLanguages_whenUserAddsTwice', async () => {
    queueQuickPicks(pickModules([]), pickLanguages([]), pickStep('add'), pickStep('add'), pickStep('continue'));
    inputBox
      .mockResolvedValueOnce('Go').mockResolvedValueOnce('').mockResolvedValueOnce('')
      .mockResolvedValueOnce('Rust').mockResolvedValueOnce('Cargo').mockResolvedValueOnce('');

    await runSetup();

    const request = client.setupStart.mock.calls[0][0];
    expect(request.custom_languages.map((language: { name: string }) => language.name)).toEqual(['Go', 'Rust']);
  });

  it('runProjectSetup_shouldListAddedNamesOnStartRow_afterAProfileWasAdded', async () => {
    queueQuickPicks(pickModules([]), pickLanguages([]), pickStep('add'), pickStep('continue'));
    inputBox.mockResolvedValueOnce('Go').mockResolvedValueOnce('').mockResolvedValueOnce('');

    await runSetup();

    const secondStepItems = quickPick.mock.calls[3][0] as unknown as PickItem[];
    expect(secondStepItems.find((item) => item.step === 'continue')?.description).toBe('custom: Go');
  });

  it('runProjectSetup_shouldSkipProfile_whenUserCancelsAnInputStep', async () => {
    queueQuickPicks(pickModules([]), pickLanguages([]), pickStep('add'), pickStep('continue'));
    inputBox.mockResolvedValueOnce('Go').mockResolvedValueOnce(undefined);

    await runSetup();

    expect(client.setupStart).toHaveBeenCalledWith(expect.objectContaining({ custom_languages: [] }));
  });

  it('runProjectSetup_shouldNotStartSetup_whenUserDismissesCustomProfileStep', async () => {
    queueQuickPicks(pickModules(['git']), pickLanguages([7]), pickStep(undefined));

    await runSetup();

    expect(client.setupStart).not.toHaveBeenCalled();
    expect(openSocketTerminal).not.toHaveBeenCalled();
  });

  it('runProjectSetup_shouldNotAskForLanguages_whenModulePickIsCancelled', async () => {
    queueQuickPicks(async () => undefined);

    await runSetup();

    expect(quickPick).toHaveBeenCalledTimes(1);
    expect(client.setupStart).not.toHaveBeenCalled();
  });

  it('runProjectSetup_shouldRequireNonBlankLanguageName', async () => {
    queueQuickPicks(pickModules([]), pickLanguages([]), pickStep('add'), pickStep('continue'));
    inputBox.mockResolvedValue(undefined);

    await runSetup();

    const options = inputBox.mock.calls[0][0] as { validateInput: (value: string) => string | undefined };
    expect(options.validateInput('   ')).toBe('A language name is required.');
    expect(options.validateInput('Go')).toBeUndefined();
  });

  it('runProjectSetup_shouldAllowBlankOptionalFields', async () => {
    queueQuickPicks(pickModules([]), pickLanguages([]), pickStep('add'), pickStep('continue'));
    inputBox.mockResolvedValueOnce('Go').mockResolvedValue(undefined);

    await runSetup();

    const configOptions = inputBox.mock.calls[1][0] as { validateInput: (value: string) => string | undefined };
    expect(configOptions.validateInput('')).toBeUndefined();
  });
});
