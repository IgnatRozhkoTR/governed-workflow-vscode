import type { TabModule } from '../types';
import { PHASE_MESSAGES } from './messages';
import { PhaseTab } from './PhaseTab';
import './phase.css';

export const phaseTab: TabModule = {
  id: 'phase',
  titleKey: 'tabs.phaseControl',
  icon: 'milestone',
  messages: PHASE_MESSAGES,
  Component: PhaseTab,
};
