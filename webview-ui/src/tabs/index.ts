import { changesTab } from './changes';
import { phaseTab } from './phase';
import { planningTab } from './planning';
import { preplanningTab } from './preplanning';
import { progressTab } from './progress';
import { reflectionTab } from './reflection';
import { researchTab } from './research';
import { reviewTab } from './review';
import { scratchpadsTab } from './scratchpads';
import { settingsTab } from './settings';
import type { TabModule } from './types';

export const TAB_MODULES: readonly TabModule[] = [
  preplanningTab,
  planningTab,
  researchTab,
  phaseTab,
  changesTab,
  reviewTab,
  progressTab,
  reflectionTab,
  scratchpadsTab,
  settingsTab,
];
