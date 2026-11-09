import type { SettingsSectionModule } from '../../types';
import { claudeSection } from './claude';
import { gitSection } from './git';
import { phasesSection } from './phases';
import { reviewModeSection } from './reviewMode';
import { rulesSection } from './rules';
import { systemSection } from './system';
import { taskSection } from './task';
import { verificationSection } from './verification';
import { workflowSection } from './workflow';

export const SETTINGS_SECTIONS: readonly SettingsSectionModule[] = [
  taskSection,
  workflowSection,
  phasesSection,
  reviewModeSection,
  verificationSection,
  rulesSection,
  gitSection,
  claudeSection,
  systemSection,
];
