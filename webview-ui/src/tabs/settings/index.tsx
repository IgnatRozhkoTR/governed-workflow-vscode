import type { TabModule } from '../types';
import { SettingsTab } from './SettingsTab';
import './settings.css';

export const settingsTab: TabModule = {
  id: 'settings',
  titleKey: 'tabs.settings',
  icon: 'settings-gear',
  Component: SettingsTab,
};
