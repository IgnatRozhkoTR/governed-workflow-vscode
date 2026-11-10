// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsSectionModule } from '../../../webview-ui/src/tabs/types';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

function section(id: string, order: number): SettingsSectionModule {
  return { id, titleKey: `settings.nav.${id}`, order, Component: () => <p>{`${id} body`}</p> } as unknown as SettingsSectionModule;
}

vi.mock('../../../webview-ui/src/tabs/settings/sections', () => ({
  SETTINGS_SECTIONS: [section('git', 30), section('task', 10), section('workflow', 20)],
}));

const { SettingsTab } = await import('../../../webview-ui/src/tabs/settings/SettingsTab');
const { store } = await import('../../../webview-ui/src/store/store');

function picker(): HTMLSelectElement {
  return document.querySelector('select.gw-settings-picker') as HTMLSelectElement;
}

afterEach(cleanup);

describe('SettingsSectionPicker', () => {
  it('render_shouldOfferEverySectionGroupedInNavOrder_withCurrentSectionSelected', () => {
    render(<SettingsTab active nav={{ tab: 'settings', section: 'workflow' }} />);

    const groups = [...picker().querySelectorAll('optgroup')].map((group) => [...group.querySelectorAll('option')].map((option) => option.value));
    expect(groups).toEqual([['task'], ['workflow'], ['git']]);
    expect(picker().value).toBe('workflow');
  });

  it('change_shouldNavigateToPickedSection_whenOptionChosen', () => {
    render(<SettingsTab active nav={{ tab: 'settings', section: 'task' }} />);

    fireEvent.change(picker(), { target: { value: 'git' } });

    expect(store.getSnapshot().nav).toEqual({ tab: 'settings', section: 'git' });
  });

  it('change_shouldIgnoreValue_whenItNamesNoSection', () => {
    render(<SettingsTab active nav={{ tab: 'settings', section: 'task' }} />);
    store.navigate({ tab: 'settings', section: 'task' });

    fireEvent.change(picker(), { target: { value: 'missing' } });

    expect(store.getSnapshot().nav).toEqual({ tab: 'settings', section: 'task' });
  });
});
