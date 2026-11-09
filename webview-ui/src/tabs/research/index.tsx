import type { TabModule } from '../types';
import { RESEARCH_MESSAGES } from './messages';
import { ResearchTab } from './ResearchTab';
import './research.css';

export const researchTab: TabModule = {
  id: 'research',
  titleKey: 'tabs.research',
  icon: 'beaker',
  messages: RESEARCH_MESSAGES,
  Component: ResearchTab,
};
