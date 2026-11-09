import type { AdvanceModes, CommandConfig, CommandConfigPatch, ConfiguratorWarning, PhaseSettingsMap, RuleDraft } from '../../../api/settings';

export const RULE_NAME_PATTERN = /^[a-z0-9][a-z0-9\-_]{0,62}$/;

export const REVIEW_MODES = [
  { value: 'manual', labelKey: 'reviewMode.manual.label', descriptionKey: 'reviewMode.manual.desc' },
  { value: 'integration', labelKey: 'reviewMode.integration.label', descriptionKey: 'reviewMode.integration.desc' },
  { value: 'files_integration', labelKey: 'reviewMode.filesIntegration.label', descriptionKey: 'reviewMode.filesIntegration.desc' },
  { value: 'full', labelKey: 'reviewMode.full.label', descriptionKey: 'reviewMode.full.desc' },
] as const;

export const DEFAULT_REVIEW_MODE = 'files_integration';

export const ADVANCE_BOUNDARIES = [
  { key: '1', labelKey: 'advanceModes.boundary1Name', descriptionKey: 'advanceModes.boundary1Desc' },
  { key: '2', labelKey: 'advanceModes.boundary2Name', descriptionKey: 'advanceModes.boundary2Desc' },
  { key: '3.1', labelKey: 'advanceModes.boundary31Name', descriptionKey: 'advanceModes.boundary31Desc' },
  { key: '3.x', labelKey: 'advanceModes.boundary3xName', descriptionKey: 'advanceModes.boundary3xDesc' },
  { key: '4', labelKey: 'advanceModes.boundary4Name', descriptionKey: 'advanceModes.boundary4Desc' },
  { key: '5', labelKey: 'advanceModes.boundary5Name', descriptionKey: 'advanceModes.boundary5Desc' },
] as const;

export const ADVANCE_MODE_OPTIONS = [
  { value: 'none', labelKey: 'advanceModes.modeNone', titleKey: 'advanceModes.modeNoneTitle' },
  { value: 'compact', labelKey: 'advanceModes.modeCompact', titleKey: 'advanceModes.modeCompactTitle' },
  { value: 'clear', labelKey: 'advanceModes.modeClear', titleKey: 'advanceModes.modeClearTitle' },
] as const;

const DEFAULT_ADVANCE_MODE = 'none';

export function parsePathLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

export function validateRuleDraft(draft: RuleDraft, isNew: boolean): string | undefined {
  if (isNew && !RULE_NAME_PATTERN.test(draft.name.trim())) {
    return 'rules.invalidName';
  }
  if (draft.description.trim() === '') {
    return 'rules.description';
  }
  if (draft.paths.length === 0) {
    return 'rules.pathsRequired';
  }
  return draft.body.trim() === '' ? 'rules.body' : undefined;
}

export function diffCommandConfig(saved: CommandConfig, draft: CommandConfig): CommandConfigPatch {
  const patch: Record<string, string | boolean> = {};
  for (const field of Object.keys(saved) as (keyof CommandConfig)[]) {
    if (saved[field] !== draft[field]) {
      patch[field] = field === 'claude_command' || field === 'allowed_external_paths' ? String(draft[field]).trim() : draft[field];
    }
  }
  return patch as CommandConfigPatch;
}

export function effectiveAdvanceMode(saved: AdvanceModes, pending: AdvanceModes, key: string): string {
  return pending[key] ?? saved[key] ?? DEFAULT_ADVANCE_MODE;
}

export function setPendingAdvanceMode(saved: AdvanceModes, pending: AdvanceModes, key: string, value: string): AdvanceModes {
  const next = { ...pending, [key]: value };
  if ((saved[key] ?? DEFAULT_ADVANCE_MODE) === value) {
    delete next[key];
  }
  return next;
}

export function validateAdvanceModes(modes: AdvanceModes): string | undefined {
  const allowed: readonly string[] = ADVANCE_MODE_OPTIONS.map((option) => option.value);
  const invalid = Object.entries(modes).find(([key, value]) => key.trim() === '' || !allowed.includes(value));
  return invalid === undefined ? undefined : `${invalid[0]}: ${invalid[1]}`;
}

export function isPhaseEnabled(alwaysOn: boolean, id: string, saved: PhaseSettingsMap, pending: PhaseSettingsMap): boolean {
  if (alwaysOn) {
    return true;
  }
  return pending[id] ?? saved[id] ?? true;
}

export function setPendingPhase(saved: PhaseSettingsMap, pending: PhaseSettingsMap, id: string, enabled: boolean): PhaseSettingsMap {
  const next = { ...pending, [id]: enabled };
  if ((saved[id] ?? true) === enabled) {
    delete next[id];
  }
  return next;
}

export function describeWarning(warning: ConfiguratorWarning): string {
  return warning.reason === null ? `${warning.target}: ${warning.action}` : `${warning.target}: ${warning.action} (${warning.reason})`;
}

export function toggleModule(enabled: readonly string[], id: string, isOn: boolean): string[] {
  const rest = enabled.filter((moduleId) => moduleId !== id);
  return isOn ? [...rest, id] : rest;
}

export function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item));
}
