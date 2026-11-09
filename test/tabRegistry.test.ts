// @vitest-environment happy-dom
import { TAB_ORDER } from '@shared/navigation';
import { describe, expect, it } from 'vitest';
import { SETTINGS_SECTIONS } from '../webview-ui/src/tabs/settings/sections';
import { TAB_MODULES } from '../webview-ui/src/tabs';

const SETTINGS_SECTION_IDS = ['task', 'workflow', 'phases', 'reviewMode', 'verification', 'rules', 'git', 'claude', 'system'];

describe('TAB_MODULES', () => {
  it('registry_shouldRegisterEveryNavigationTab', () => {
    expect(TAB_MODULES.map((tab) => tab.id).sort()).toEqual([...TAB_ORDER].sort());
  });

  it('registry_shouldFollowNavigationTabOrder', () => {
    expect(TAB_MODULES.map((tab) => tab.id)).toEqual(TAB_ORDER);
  });

  it('registry_shouldUseUniqueTabIdsAndTitleKeys', () => {
    const ids = TAB_MODULES.map((tab) => tab.id);
    const titleKeys = TAB_MODULES.map((tab) => tab.titleKey);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titleKeys).size).toBe(titleKeys.length);
  });

  it('registry_shouldGiveEveryTabTitleKeyIconAndComponent', () => {
    for (const tab of TAB_MODULES) {
      expect(tab.titleKey, tab.id).not.toBe('');
      expect(tab.icon, tab.id).toBeTruthy();
      expect(typeof tab.Component, tab.id).toBe('function');
    }
  });
});

describe('module messages', () => {
  it('messages_shouldDefineTitle_whenTabUsesExtensionOwnedKey', () => {
    const owned = TAB_MODULES.filter((tab) => tab.titleKey.startsWith('vsc.'));

    expect(owned.length).toBeGreaterThan(0);
    for (const tab of owned) {
      expect(tab.messages?.en[tab.titleKey], tab.id).toBeTruthy();
      expect(tab.messages?.ru[tab.titleKey], tab.id).toBeTruthy();
    }
  });

  it('messages_shouldDefineSameKeysForBothLocales_whenModuleProvidesThem', () => {
    const modules = [...TAB_MODULES, ...SETTINGS_SECTIONS].filter((module) => module.messages !== undefined);

    expect(modules.length).toBeGreaterThan(0);
    for (const module of modules) {
      const { en, ru } = module.messages as NonNullable<typeof module.messages>;
      expect(Object.keys(ru).sort(), module.id).toEqual(Object.keys(en).sort());
    }
  });
});

describe('SETTINGS_SECTIONS', () => {
  it('registry_shouldRegisterEverySettingsSection', () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id).sort()).toEqual([...SETTINGS_SECTION_IDS].sort());
  });

  it('registry_shouldUseUniqueSectionIdsAndOrders', () => {
    const ids = SETTINGS_SECTIONS.map((section) => section.id);
    const orders = SETTINGS_SECTIONS.map((section) => section.order);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('registry_shouldGiveEverySectionTitleKeyAndComponent', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(section.titleKey, section.id).toBeTruthy();
      expect(typeof section.Component, section.id).toBe('function');
    }
  });
});
