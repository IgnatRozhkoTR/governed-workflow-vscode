import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import { COMMAND_IDS, registerWorkspaceCommands, toCreateRequest, type WorkspaceCommandDeps } from '../src/commands/workspaceCommands';

const quickPick = vi.mocked(vscode.window.showQuickPick);
const inputBox = vi.mocked(vscode.window.showInputBox);

const PROJECT = { id: 'proj', name: 'Proj', path: '/p', project_type: 'single' };

const client = {
  getProjectSettings: vi.fn(),
  createWorkspace: vi.fn(),
  listProjects: vi.fn(),
};
const selector = { select: vi.fn(), selectInThisWindow: vi.fn() };
const projectsTree = { refresh: vi.fn() };

function setDefaults(defaults: { yolo: boolean; fast: boolean }): void {
  client.getProjectSettings.mockResolvedValue({ yolo_mode_default: defaults.yolo, fast_mode_default: defaults.fast, review_mode_default: 'manual', project_type: 'single' });
}

function answerYesNo(...answers: (boolean | undefined)[]): void {
  answers.forEach((answer) =>
    quickPick.mockImplementationOnce((async (items: { value: boolean }[]) => (answer === undefined ? undefined : items.find((item) => item.value === answer))) as never),
  );
}

async function runCreate(): Promise<void> {
  const registered = vi.mocked(vscode.commands.registerCommand).mock.calls.find(([id]) => id === COMMAND_IDS.createWorkspace);
  await (registered?.[1] as (arg: unknown) => Promise<void>)({ project: PROJECT });
}

function promptsAsked(): string[] {
  return quickPick.mock.calls.map(([, options]) => (options as { placeHolder: string }).placeHolder);
}

beforeEach(() => {
  vi.clearAllMocks();
  quickPick.mockReset();
  inputBox.mockReset();
  client.createWorkspace.mockResolvedValue({ workspace: 'w', working_dir: '/p/w', branch: 'feature/x', command: '' });
  inputBox.mockResolvedValue('feature/x');
  setDefaults({ yolo: false, fast: false });
  registerWorkspaceCommands({ subscriptions: [] } as unknown as ExtensionContext, {
    client,
    selector,
    projectsTree,
    active: { onDidChange: vi.fn() },
  } as unknown as WorkspaceCommandDeps);
});

describe('createWorkspace', () => {
  it('createWorkspace_shouldAskNothingBeyondName_whenYoloAndFastDefaultOn', async () => {
    setDefaults({ yolo: true, fast: true });

    await runCreate();

    expect(quickPick).not.toHaveBeenCalled();
    expect(inputBox).toHaveBeenCalledTimes(1);
    expect(client.createWorkspace).toHaveBeenCalledWith('proj', { branch: 'feature/x' });
  });

  it('createWorkspace_shouldAskYoloAndFast_whenBothDefaultsOff', async () => {
    answerYesNo(true, true);

    await runCreate();

    expect(promptsAsked()).toEqual(['YOLO mode?', 'Fast mode?']);
    expect(client.createWorkspace).toHaveBeenCalledWith('proj', { branch: 'feature/x', yolo_mode: true, workflow_mode: 'fast' });
  });

  it('createWorkspace_shouldKeepPromptsOpenOnFocusLoss_whenAsking', async () => {
    answerYesNo(false, false);

    await runCreate();

    expect(inputBox.mock.calls[0][0]).toMatchObject({ ignoreFocusOut: true });
    expect(quickPick.mock.calls.map(([, options]) => options)).toEqual([
      expect.objectContaining({ ignoreFocusOut: true }),
      expect.objectContaining({ ignoreFocusOut: true }),
    ]);
  });

  it('createWorkspace_shouldAskOnlyFast_whenYoloDefaultOn', async () => {
    setDefaults({ yolo: true, fast: false });
    answerYesNo(false);

    await runCreate();

    expect(promptsAsked()).toEqual(['Fast mode?']);
    expect(client.createWorkspace).toHaveBeenCalledWith('proj', { branch: 'feature/x' });
  });

  it('createWorkspace_shouldAskOnlyYolo_whenFastDefaultOn', async () => {
    setDefaults({ yolo: false, fast: true });
    answerYesNo(true);

    await runCreate();

    expect(promptsAsked()).toEqual(['YOLO mode?']);
    expect(client.createWorkspace).toHaveBeenCalledWith('proj', { branch: 'feature/x', yolo_mode: true });
  });

  it('createWorkspace_shouldNotCreate_whenNameInputCancelled', async () => {
    inputBox.mockReset();
    inputBox.mockResolvedValue(undefined);

    await runCreate();

    expect(client.getProjectSettings).not.toHaveBeenCalled();
    expect(client.createWorkspace).not.toHaveBeenCalled();
  });

  it('createWorkspace_shouldNotCreate_whenYoloPickCancelled', async () => {
    answerYesNo(undefined);

    await runCreate();

    expect(promptsAsked()).toEqual(['YOLO mode?']);
    expect(client.createWorkspace).not.toHaveBeenCalled();
  });

  it('createWorkspace_shouldNotCreate_whenFastPickCancelled', async () => {
    answerYesNo(false, undefined);

    await runCreate();

    expect(client.createWorkspace).not.toHaveBeenCalled();
  });

  it('createWorkspace_shouldSelectWorkspaceWithOpeningBehaviour_whenCreated', async () => {
    answerYesNo(false, false);

    await runCreate();

    expect(selector.select).toHaveBeenCalledWith({ projectId: 'proj', branch: 'feature/x' }, { tab: 'settings', section: 'task', anchor: 'ticket-name' });
    expect(selector.selectInThisWindow).not.toHaveBeenCalled();
  });

  it('createWorkspace_shouldNeverSendTicketFields', async () => {
    answerYesNo(false, false);

    await runCreate();

    const request = client.createWorkspace.mock.calls[0][1];
    expect(Object.keys(request)).toEqual(['branch']);
  });
});

describe('toCreateRequest', () => {
  it('toCreateRequest_shouldOmitModes_whenNotChosen', () => {
    expect(toCreateRequest({ branch: 'b', isYolo: false, isFast: false })).toEqual({ branch: 'b' });
  });
});
