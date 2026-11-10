// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { SettingsSectionModule } from '../../../webview-ui/src/tabs/types';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

const { resolveSettingsSection } = await import('../../../webview-ui/src/tabs/settings/SettingsTab');

function section(id: string, order: number): SettingsSectionModule {
  return { id, titleKey: `settings.nav.${id}`, order, Component: () => null } as unknown as SettingsSectionModule;
}

const SECTIONS = [section('task', 10), section('workflow', 20), section('git', 30)];

describe('resolveSettingsSection', () => {
  it('resolveSettingsSection_shouldPreferNavSection_whenNavNamesOne', () => {
    expect(resolveSettingsSection(SECTIONS, 'git', 'workflow')?.id).toBe('git');
  });

  it('resolveSettingsSection_shouldKeepRememberedSection_whenNavCarriesNoSection', () => {
    expect(resolveSettingsSection(SECTIONS, undefined, 'workflow')?.id).toBe('workflow');
  });

  it('resolveSettingsSection_shouldFallBackToFirst_whenNothingMatches', () => {
    expect(resolveSettingsSection(SECTIONS, 'unknown', 'removed')?.id).toBe('task');
    expect(resolveSettingsSection([], undefined, '')).toBeUndefined();
  });
});
