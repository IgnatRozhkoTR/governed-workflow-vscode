import type { TabModule } from '../types';
import { ChangesTab } from './ChangesTab';
import { CHANGES_MESSAGES } from './messages';
import './changes.css';

export const changesTab: TabModule = {
  id: 'changes',
  titleKey: 'tabs.changes',
  icon: 'git-compare',
  messages: CHANGES_MESSAGES,
  Component: ChangesTab,
};
