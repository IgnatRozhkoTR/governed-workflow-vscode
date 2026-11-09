import type { TabModule } from '../types';
import { PROGRESS_MESSAGES } from './messages';
import { ProgressTab } from './ProgressTab';
import './progress.css';

export const progressTab: TabModule = {
  id: 'progress',
  titleKey: 'vsc.tabs.progress',
  icon: 'pulse',
  messages: PROGRESS_MESSAGES,
  Component: ProgressTab,
};
