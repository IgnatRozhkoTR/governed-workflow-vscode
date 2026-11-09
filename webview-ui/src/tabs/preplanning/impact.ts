export interface ImpactSection {
  readonly key: string;
  readonly labelKey: string;
  readonly value: unknown;
}

const IMPACT_SECTIONS: readonly { readonly key: string; readonly labelKey: string }[] = [
  { key: 'affected_flows', labelKey: 'impact.affectedFlows' },
  { key: 'api_changes', labelKey: 'impact.apiChanges' },
  { key: 'data_flow_changes', labelKey: 'impact.dataFlowChanges' },
  { key: 'external_dependencies', labelKey: 'impact.externalDeps' },
  { key: 'ticket_gaps', labelKey: 'impact.ticketGaps' },
  { key: 'open_questions', labelKey: 'impact.openQuestions' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined || value === '' || value === false) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return !isRecord(value) || Object.keys(value).length > 0;
}

export function impactSections(analysis: unknown): ImpactSection[] {
  if (!isRecord(analysis)) {
    return [];
  }
  return IMPACT_SECTIONS
    .filter((section) => isPresent(analysis[section.key]))
    .map((section) => ({ ...section, value: analysis[section.key] }));
}
