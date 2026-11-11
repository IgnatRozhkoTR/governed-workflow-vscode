import { describe, expect, it } from 'vitest';
import { CompanionPromptMemory } from '../src/companions/companionPromptMemory';
import { COMPANIONS, REMOTE_SSH, companionPresence, isRemoteServerUrl } from '../src/companions/companionRegistry';
import { memoryMemento } from './support/fixtures';

const LOCAL = { serverUrl: 'http://localhost:5111', remoteName: undefined };
const notInstalled = (): boolean => false;
const installed = (): boolean => true;

describe('isRemoteServerUrl', () => {
  it.each(['http://localhost:5111', 'http://127.0.0.1:5111', 'http://[::1]:5111', 'http://LOCALHOST:5111'])(
    'isRemoteServerUrl_shouldBeFalse_forLoopback_%s',
    (url) => {
      expect(isRemoteServerUrl(url)).toBe(false);
    },
  );

  it('isRemoteServerUrl_shouldBeTrue_forLanHost', () => {
    expect(isRemoteServerUrl('http://192.168.1.20:5111')).toBe(true);
    expect(isRemoteServerUrl('http://build-box:5111')).toBe(true);
  });

  it('isRemoteServerUrl_shouldBeFalse_whenUrlCannotBeParsed', () => {
    expect(isRemoteServerUrl('not a url')).toBe(false);
  });
});

describe('REMOTE_SSH', () => {
  it('isNeeded_shouldFollowTheServerUrl', () => {
    expect(REMOTE_SSH.isNeeded(LOCAL)).toBe(false);
    expect(REMOTE_SSH.isNeeded({ serverUrl: 'http://10.0.0.5:5111', remoteName: undefined })).toBe(true);
  });

  it('registry_shouldListRemoteSshOnly', () => {
    expect(COMPANIONS.map((companion) => companion.id)).toEqual(['ms-vscode-remote.remote-ssh']);
  });
});

describe('companionPresence', () => {
  it('companionPresence_shouldBeInstalled_inAnSshRemoteWindow_evenIfThisHostCannotSeeIt', () => {
    expect(companionPresence(REMOTE_SSH, { ...LOCAL, remoteName: 'ssh-remote' }, notInstalled)).toBe('installed');
  });

  it('companionPresence_shouldBeInstalled_whenThisHostHasIt', () => {
    expect(companionPresence(REMOTE_SSH, LOCAL, installed)).toBe('installed');
  });

  it('companionPresence_shouldBeUnknown_forUiCompanionInAnotherRemoteKind', () => {
    expect(companionPresence(REMOTE_SSH, { ...LOCAL, remoteName: 'wsl' }, notInstalled)).toBe('unknown');
  });

  it('companionPresence_shouldBeMissing_inALocalWindowWithoutIt', () => {
    expect(companionPresence(REMOTE_SSH, LOCAL, notInstalled)).toBe('missing');
  });
});

describe('CompanionPromptMemory', () => {
  it('shouldPrompt_shouldAllowOnePromptPerTriggerPerSession', () => {
    const memory = new CompanionPromptMemory(memoryMemento());

    expect(memory.shouldPrompt(REMOTE_SSH.id, 'environment')).toBe(true);
    memory.markPrompted(REMOTE_SSH.id, 'environment');

    expect(memory.shouldPrompt(REMOTE_SSH.id, 'environment')).toBe(false);
  });

  it('decline_shouldSuppressAutomaticPrompts_acrossSessions', async () => {
    const globalState = memoryMemento();
    await new CompanionPromptMemory(globalState).decline(REMOTE_SSH.id);

    const nextSession = new CompanionPromptMemory(globalState);

    expect(nextSession.isDeclined(REMOTE_SSH.id)).toBe(true);
    expect(nextSession.shouldPrompt(REMOTE_SSH.id, 'environment')).toBe(false);
  });

  it('shouldPrompt_shouldAlwaysAllowExplicitCommand_evenAfterDecline', async () => {
    const memory = new CompanionPromptMemory(memoryMemento());
    await memory.decline(REMOTE_SSH.id);
    memory.markPrompted(REMOTE_SSH.id, 'command');

    expect(memory.shouldPrompt(REMOTE_SSH.id, 'command')).toBe(true);
  });

  it('decline_shouldNotDuplicateIds', async () => {
    const globalState = memoryMemento();
    const memory = new CompanionPromptMemory(globalState);

    await memory.decline(REMOTE_SSH.id);
    await memory.decline(REMOTE_SSH.id);

    expect(globalState.get('governedWorkflow.declinedCompanions')).toEqual([REMOTE_SSH.id]);
  });
});
