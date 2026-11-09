import type { TabModule } from '../types';
import { PLANNING_MESSAGES } from './messages';
import { PlanningTab } from './PlanningTab';
import './planning.css';

export const planningTab: TabModule = {
  id: 'planning',
  titleKey: 'tabs.planning',
  icon: 'checklist',
  messages: PLANNING_MESSAGES,
  Component: PlanningTab,
};
