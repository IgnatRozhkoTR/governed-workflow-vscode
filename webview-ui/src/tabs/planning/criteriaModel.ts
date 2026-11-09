import type { Criterion } from '@api-types';

export const CRITERION_TYPES = ['unit_test', 'integration_test', 'bdd_scenario', 'custom'] as const;

const TYPE_LABEL_KEYS: Readonly<Record<string, string>> = {
  unit_test: 'criteria.unitTest',
  integration_test: 'criteria.integrationTest',
  bdd_scenario: 'criteria.bddScenario',
  custom: 'criteria.custom',
};

export interface CriterionDraft {
  readonly type: string;
  readonly description: string;
  readonly file: string;
  readonly names: string;
}

export interface CriterionDetails {
  readonly file?: string;
  readonly names: readonly string[];
  readonly isScenario: boolean;
  readonly instruction?: string;
}

export function criterionTypeKey(type: string): string {
  return TYPE_LABEL_KEYS[type] ?? `criteria.${type}`;
}

export function splitNames(text: string): string[] {
  return text.split(',').map((name) => name.trim()).filter((name) => name !== '');
}

export function buildDetailsJson(draft: CriterionDraft): string | undefined {
  const description = draft.description.trim();
  if (draft.type === 'custom') {
    return description === '' ? undefined : JSON.stringify({ instruction: description });
  }
  const names = splitNames(draft.names);
  const file = draft.file.trim();
  const details: Record<string, unknown> = {};
  if (file !== '') {
    details.file = file;
  }
  if (names.length > 0) {
    details[draft.type === 'bdd_scenario' ? 'scenario_names' : 'test_names'] = names;
  }
  return Object.keys(details).length === 0 ? undefined : JSON.stringify(details);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function readCriterionDetails(criterion: Criterion): CriterionDetails | undefined {
  const raw = criterion.details;
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const testNames = stringList(record.test_names);
  const scenarioNames = stringList(record.scenario_names);
  const details: CriterionDetails = {
    file: stringField(record.file),
    names: testNames.length > 0 ? testNames : scenarioNames,
    isScenario: testNames.length === 0 && scenarioNames.length > 0,
    instruction: stringField(record.instruction),
  };
  return details.file === undefined && details.names.length === 0 && details.instruction === undefined ? undefined : details;
}
