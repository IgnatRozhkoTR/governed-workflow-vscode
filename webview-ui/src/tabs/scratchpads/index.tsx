import type { TabModule } from '../types';
import { SCRATCHPADS_MESSAGES } from './messages';
import { ScratchpadsTab } from './ScratchpadsTab';
import './scratchpads.css';

export const scratchpadsTab: TabModule = {
  id: 'scratchpads',
  titleKey: 'sidebar.scratchpads',
  icon: 'notebook',
  messages: SCRATCHPADS_MESSAGES,
  Component: ScratchpadsTab,
};
