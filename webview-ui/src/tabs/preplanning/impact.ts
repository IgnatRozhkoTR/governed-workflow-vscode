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

const PREVIEW_MAX_CHARS = 120;

function firstText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? '' : firstText(value[0]);
  }
  if (isRecord(value)) {
    const first = Object.values(value)[0];
    return first === undefined ? '' : firstText(first);
  }
  return value === null || value === undefined ? '' : String(value);
}

// A collapsed impact card shows its first point, so the reviewer can skim all sections before deciding what to open.
export function impactPreview(value: unknown): string {
  const line = firstText(value).replace(/[*`]/g, '').replace(/^[\s#>-]+/, '').replace(/\s+/g, ' ').trim();
  return line.length > PREVIEW_MAX_CHARS ? `${line.slice(0, PREVIEW_MAX_CHARS - 1)}…` : line;
}
