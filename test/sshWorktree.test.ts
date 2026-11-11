import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import type { ServerInfo, WorkspaceState } from '../src/api/types';
import type { Settings } from '../src/config/settings';
import { CompanionPromptMemory } from '../src/companions/companionPromptMemory';
import type { WorkspaceLocator } from '../src/fs/workspaceLocator';
import type { ActiveWorkspace } from '../src/state/activeWorkspace';
import type { OnSelectWorkspace } from '../src/worktree/onSelectWorkspace';
import { ensureInstalledOnSshHosts, isRunningOnSshClientSide, withExtensionId } from '../src/worktree/sshHostExtension';
import { opensSshInNewWindow, resolveSshTarget, sshFolderUri } from '../src/worktree/sshTarget';
import { SshWorktreeOpener } from '../src/worktree/sshWorktreeOpener';
import { WorkspaceSelector } from '../src/worktree/workspaceSelector';
import { WorktreeHandoff } from '../src/worktree/worktreeHandoff';
import { NEW_WORKSPACE_NAV } from '../src/shared/navigation';
import { makeState, memoryMemento } from './support/fixtures';
import { ConfigurationTarget, ExtensionKind, commands, env, extensions, window, workspace } from './vscodeStub';

const EXTENSION_ID = 'ignatrozhko.governed-workflow-vscode';
const REMOTE_SSH_ID = 'ms-vscode-remote.remote-ssh';
const SERVER_URL = 'http://MacBook-Pro-Ignat.local:5111';
const WORKTREE = '/Users/ig/worktrees/feature-x';
const REF = { projectId: 'p1', branch: 'feature/x' };
const SERVER_INFO: ServerInfo = { hostname: 'MacBook-Pro-Ignat', user: 'ig', home: '/Users/ig', platform: 'darwin' };

const notFound = (): ApiError => new ApiError(404, 'http_404', 'Not Found');
const serverInfoSource = (info: () => Promise<ServerInfo>) => ({ getServerInfo: vi.fn(info) });

interface SelectorScenario {
  readonly serverUrl?: string;
  readonly sshHost?: string;
  readonly behaviour?: OnSelectWorkspace;
  readonly isLocal?: boolean;
  readonly serverInfo?: () => Promise<ServerInfo>;
}

function selectorFor(scenario: SelectorScenario = {}) {
  const state: WorkspaceState = makeState({ working_dir: WORKTREE, branch: REF.branch });
  const client = {
    getState: vi.fn(async () => ({ notModified: false, state })),
    getServerInfo: vi.fn(scenario.serverInfo ?? (async () => SERVER_INFO)),
  };
  const settings = {
    serverUrl: scenario.serverUrl ?? SERVER_URL,
    sshHost: scenario.sshHost,
    onSelectWorkspace: scenario.behaviour ?? 'newWindow',
  } as unknown as Settings;
  const active = { select: vi.fn() };
  const globalState = memoryMemento();
  const handoff = new WorktreeHandoff(globalState);
  const sshOpener = new SshWorktreeOpener({
    client,
    settings,
    handoff,
    companionMemory: new CompanionPromptMemory(memoryMemento()),
    extensionId: EXTENSION_ID,
  });
  const selector = new WorkspaceSelector({
    client: client as unknown as ApiClient,
    active: active as unknown as ActiveWorkspace,
    locator: { isLocal: () => scenario.isLocal ?? false } as unknown as WorkspaceLocator,
    settings,
    handoff,
    sshOpener,
  });
  return { selector, client, active, handoff };
}

function remoteSettings(globalValue: unknown = undefined) {
  const configuration = { inspect: vi.fn(() => ({ globalValue })), update: vi.fn(async () => undefined) };
  workspace.getConfiguration.mockReturnValue(configuration);
  return configuration;
}

function openFolderCall(): { uri: { scheme: string; authority: string; path: string }; options: { forceNewWindow: boolean } } | undefined {
  const call = commands.executeCommand.mock.calls.find(([id]) => id === 'vscode.openFolder');
  return call === undefined ? undefined : { uri: call[1], options: call[2] };
}

beforeEach(() => {
  vi.clearAllMocks();
  env.remoteName = undefined;
  extensions.getExtension.mockImplementation((id: string) => (id === REMOTE_SSH_ID ? { id } : undefined));
  remoteSettings();
});

describe('resolveSshTarget', () => {
  it('resolveSshTarget_shouldUseConfiguredHost_withoutAskingThePanel', async () => {
    const source = serverInfoSource(async () => SERVER_INFO);

    expect(await resolveSshTarget('mac-alias', 'macbook.local', source)).toBe('mac-alias');
    expect(source.getServerInfo).not.toHaveBeenCalled();
  });

  it('resolveSshTarget_shouldCombineReportedUserWithServerUrlHost_notReportedHostname', async () => {
    expect(await resolveSshTarget(undefined, 'MacBook-Pro-Ignat.local', serverInfoSource(async () => SERVER_INFO))).toBe('ig@MacBook-Pro-Ignat.local');
  });

  it('resolveSshTarget_shouldFallBackToBareHost_whenServerInfoIsMissing', async () => {
    expect(await resolveSshTarget(undefined, 'macbook.local', serverInfoSource(async () => { throw notFound(); }))).toBe('macbook.local');
  });

  it('resolveSshTarget_shouldFallBackToBareHost_whenUserIsBlank', async () => {
    expect(await resolveSshTarget(undefined, 'macbook.local', serverInfoSource(async () => ({ ...SERVER_INFO, user: ' ' })))).toBe('macbook.local');
  });

  it('resolveSshTarget_shouldRethrow_whenServerInfoFailsOtherwise', async () => {
    const failing = serverInfoSource(async () => { throw new ApiError(500, 'http_500', 'boom'); });

    await expect(resolveSshTarget(undefined, 'macbook.local', failing)).rejects.toThrow('boom');
  });
});

describe('sshFolderUri and window mode', () => {
  it('sshFolderUri_shouldAddressTheWorktreeThroughRemoteSsh', () => {
    const uri = sshFolderUri('ig@mac.local', WORKTREE);

    expect({ scheme: uri.scheme, authority: uri.authority, path: uri.path }).toEqual({
      scheme: 'vscode-remote',
      authority: 'ssh-remote+ig@mac.local',
      path: WORKTREE,
    });
  });

  it.each([
    ['newWindow', true],
    ['addFolder', true],
    ['sameWindow', false],
  ] as const)('opensSshInNewWindow_shouldMap_%s', (behaviour, isNewWindow) => {
    expect(opensSshInNewWindow(behaviour)).toBe(isNewWindow);
  });
});

describe('remote.defaultExtensionsIfInstalledLocally', () => {
  it('withExtensionId_shouldAppend_whenMissing', () => {
    expect(withExtensionId(['other.ext'], EXTENSION_ID)).toEqual(['other.ext', EXTENSION_ID]);
    expect(withExtensionId(undefined, EXTENSION_ID)).toEqual([EXTENSION_ID]);
  });

  it('withExtensionId_shouldLeaveSettingAlone_whenAlreadyListedInAnyCase', () => {
    expect(withExtensionId(['IgnatRozhko.Governed-Workflow-VSCode'], EXTENSION_ID)).toBeUndefined();
  });

  it('withExtensionId_shouldDropNonStringEntries', () => {
    expect(withExtensionId(['a.b', 42, null], EXTENSION_ID)).toEqual(['a.b', EXTENSION_ID]);
  });

  it('ensureInstalledOnSshHosts_shouldUpdateUserSetting_whenMissing', async () => {
    const configuration = remoteSettings(['other.ext']);

    await ensureInstalledOnSshHosts(EXTENSION_ID);

    expect(workspace.getConfiguration).toHaveBeenCalledWith('remote');
    expect(configuration.update).toHaveBeenCalledWith('defaultExtensionsIfInstalledLocally', ['other.ext', EXTENSION_ID], ConfigurationTarget.Global);
  });

  it('ensureInstalledOnSshHosts_shouldNotWrite_whenAlreadyListed', async () => {
    const configuration = remoteSettings([EXTENSION_ID]);

    await ensureInstalledOnSshHosts(EXTENSION_ID);

    expect(configuration.update).not.toHaveBeenCalled();
  });

  it('isRunningOnSshClientSide_shouldOnlyFlagUiHostInSshWindow', () => {
    expect(isRunningOnSshClientSide('ssh-remote', ExtensionKind.UI)).toBe(true);
    expect(isRunningOnSshClientSide('ssh-remote', ExtensionKind.Workspace)).toBe(false);
    expect(isRunningOnSshClientSide(undefined, ExtensionKind.UI)).toBe(false);
  });
});

describe('WorkspaceSelector.select', () => {
  it('select_shouldOpenLocalFolder_whenWorktreeExistsOnThisMachine', async () => {
    const { selector } = selectorFor({ isLocal: true });

    await selector.select(REF);

    expect(openFolderCall()?.uri).toMatchObject({ scheme: 'file', path: WORKTREE });
  });

  it('select_shouldOpenOverSsh_whenWorktreeIsOnThePanelMachine', async () => {
    const configuration = remoteSettings([]);
    const { selector, active, handoff } = selectorFor();

    await selector.select(REF);

    expect(openFolderCall()).toEqual({
      uri: expect.objectContaining({ scheme: 'vscode-remote', authority: 'ssh-remote+ig@macbook-pro-ignat.local', path: WORKTREE }),
      options: { forceNewWindow: true },
    });
    expect(configuration.update).toHaveBeenCalledWith('defaultExtensionsIfInstalledLocally', [EXTENSION_ID], ConfigurationTarget.Global);
    expect(await handoff.take([WORKTREE])).toEqual({ ref: REF });
    expect(active.select).not.toHaveBeenCalled();
  });

  it('select_shouldHandOffTheNavIntent_whenOpeningOverSsh', async () => {
    remoteSettings([]);
    const { selector, handoff } = selectorFor();

    await selector.select(REF, NEW_WORKSPACE_NAV);

    expect(await handoff.take([WORKTREE])).toEqual({ ref: REF, nav: NEW_WORKSPACE_NAV });
  });

  it('select_shouldHandOffTheNavIntent_whenOpeningLocalFolderInNewWindow', async () => {
    const { selector, handoff } = selectorFor({ isLocal: true });

    await selector.select(REF, NEW_WORKSPACE_NAV);

    expect(await handoff.take([WORKTREE])).toEqual({ ref: REF, nav: NEW_WORKSPACE_NAV });
  });

  it('select_shouldOpenThePanelOnTheNavDirectly_whenSelectionStaysInThisWindow', async () => {
    const { selector } = selectorFor({ behaviour: 'off' });

    await selector.select(REF, NEW_WORKSPACE_NAV);

    expect(commands.executeCommand).toHaveBeenCalledWith('governedWorkflow.openControlPanel', NEW_WORKSPACE_NAV);
  });

  it('select_shouldReuseThisWindowForSsh_whenSameWindowIsConfigured', async () => {
    const { selector } = selectorFor({ behaviour: 'sameWindow' });

    await selector.select(REF);

    expect(openFolderCall()?.options).toEqual({ forceNewWindow: false });
  });

  it('select_shouldPreferConfiguredSshHost', async () => {
    const { selector, client } = selectorFor({ sshHost: 'mac' });

    await selector.select(REF);

    expect(openFolderCall()?.uri.authority).toBe('ssh-remote+mac');
    expect(client.getServerInfo).not.toHaveBeenCalled();
  });

  it('select_shouldUseBareServerHost_whenPanelHasNoServerInfo', async () => {
    const { selector } = selectorFor({ serverInfo: async () => { throw notFound(); } });

    await selector.select(REF);

    expect(openFolderCall()?.uri.authority).toBe('ssh-remote+macbook-pro-ignat.local');
  });

  it('select_shouldInstallRemoteSshAndContinue_whenUserAccepts', async () => {
    extensions.getExtension.mockReturnValue(undefined);
    window.showInformationMessage.mockResolvedValue('Install');
    const { selector } = selectorFor();

    await selector.select(REF);

    expect(commands.executeCommand).toHaveBeenCalledWith('workbench.extensions.installExtension', REMOTE_SSH_ID);
    expect(openFolderCall()?.uri.scheme).toBe('vscode-remote');
  });

  it('select_shouldStayInWorkspaceControlAndMentionSshHost_whenUserDeclinesRemoteSsh', async () => {
    extensions.getExtension.mockReturnValue(undefined);
    window.showInformationMessage.mockResolvedValueOnce('Not now');
    const { selector, active } = selectorFor();

    await selector.select(REF);

    expect(openFolderCall()).toBeUndefined();
    expect(active.select).toHaveBeenCalledWith(REF);
    expect(window.showInformationMessage).toHaveBeenLastCalledWith(expect.stringContaining('governedWorkflow.sshHost'));
  });

  it('select_shouldNeverPromptOrOpenSsh_insideARemoteWindow', async () => {
    env.remoteName = 'ssh-remote';
    extensions.getExtension.mockReturnValue(undefined);
    const { selector, active } = selectorFor();

    await selector.select(REF);

    expect(openFolderCall()).toBeUndefined();
    expect(active.select).toHaveBeenCalledWith(REF);
    expect(window.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(window.showInformationMessage).toHaveBeenCalledWith(expect.not.stringContaining('Remote - SSH'));
  });

  it('select_shouldOnlySwitchPanel_whenServerIsLocalhost', async () => {
    const { selector, active } = selectorFor({ serverUrl: 'http://localhost:5111' });

    await selector.select(REF);

    expect(openFolderCall()).toBeUndefined();
    expect(active.select).toHaveBeenCalledWith(REF);
  });

  it('select_shouldNotOpenAnything_whenBehaviourIsOff', async () => {
    const { selector, client, active } = selectorFor({ behaviour: 'off' });

    await selector.select(REF);

    expect(client.getState).not.toHaveBeenCalled();
    expect(openFolderCall()).toBeUndefined();
    expect(active.select).toHaveBeenCalledWith(REF);
  });
});
