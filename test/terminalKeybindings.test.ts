import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Keybinding {
  command: string;
  key: string;
  mac?: string;
  when?: string;
  args?: Record<string, unknown>;
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const keybindings = manifest.contributes.keybindings as Keybinding[];
const skipShell = manifest.contributes.configurationDefaults['terminal.integrated.commandsToSkipShell'] as string[];
const commandIds = (manifest.contributes.commands as { command: string }[]).map((entry) => entry.command);
const CLAUDE_TERMINAL_FOCUS = 'terminalFocus && governedWorkflow.claudeTerminalActive';

function bindingsFor(command: string): Keybinding[] {
  return keybindings.filter((binding) => binding.command === `governedWorkflow.${command}`);
}

describe('terminal keybindings', () => {
  it.each([
    ['toggleTerminal', 'ctrl+alt+`'],
    ['showTerminal', 'ctrl+alt+t'],
    ['toggleTerminalFullScreen', 'ctrl+alt+shift+enter'],
    ['openChangesTab', 'ctrl+alt+shift+c'],
    ['openScratchpads', 'ctrl+alt+shift+s'],
  ])('keybinding_shouldUseSameCtrlAltKeyOnMac_for %s', (command, key) => {
    const [binding] = bindingsFor(command);

    expect(binding).toMatchObject({ key, mac: key });
    expect(commandIds).toContain(`governedWorkflow.${command}`);
  });

  it('toggleTerminal_shouldPassFocus_onlyWhenClaudeTerminalHasFocus', () => {
    const [unconditional, focused] = bindingsFor('toggleTerminal');

    expect(unconditional.when).toBeUndefined();
    expect(focused.when).toBe(CLAUDE_TERMINAL_FOCUS);
    expect(focused.args).toEqual({ isFocused: true });
  });

  it('pasteImage_shouldBindCtrlVOnMacAndAltVElsewhere_withOriginalKeyAsFallback', () => {
    expect(bindingsFor('pasteImage')).toEqual([
      expect.objectContaining({ key: 'ctrl+v', when: `isMac && ${CLAUDE_TERMINAL_FOCUS}`, args: { fallbackInput: '\x16' } }),
      expect.objectContaining({ key: 'alt+v', when: `!isMac && ${CLAUDE_TERMINAL_FOCUS}`, args: { fallbackInput: '\x1bv' } }),
    ]);
  });

  it('pasteImage_shouldLeaveCmdVTextPasteAlone', () => {
    expect(keybindings.some((binding) => binding.key.includes('cmd+v') || binding.mac?.includes('cmd+v'))).toBe(false);
  });

  it('commandsToSkipShell_shouldListEveryTerminalShortcut', () => {
    const shortcutCommands = new Set(
      ['toggleTerminal', 'showTerminal', 'toggleTerminalFullScreen', 'openChangesTab', 'openScratchpads', 'pasteImage'].map((id) => `governedWorkflow.${id}`),
    );

    expect(new Set(skipShell)).toEqual(shortcutCommands);
  });

  it('terminalLayoutSetting_shouldOfferOnlyFullscreenAndPanel', () => {
    const layout = manifest.contributes.configuration.properties['governedWorkflow.terminal.layout'];

    expect(layout.enum).toEqual(['fullscreen', 'panel']);
    expect(layout.default).toBe('fullscreen');
    expect(commandIds).not.toContain('governedWorkflow.terminalLayoutEditor');
  });
});
