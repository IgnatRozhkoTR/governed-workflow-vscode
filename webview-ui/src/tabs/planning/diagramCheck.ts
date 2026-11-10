import { normalizeSystemDiagrams, prepareDiagramSource } from './systemDiagram';

const UNREADABLE_DIAGRAM_DATA = 1;

// The Architecture card shows a failed diagram as an error in place of the drawing; this finds the same failures
// without rendering, so the plan decision can mention them and the card can point at the first one.
export async function failedDiagramIndexes(raw: unknown): Promise<number[]> {
  const { entries } = normalizeSystemDiagrams(raw);
  if (entries.length === 0) {
    return [];
  }
  const mermaid = (await import('mermaid')).default;
  const results = await Promise.all(entries.map((entry) => mermaid.parse(prepareDiagramSource(entry.source, false), { suppressErrors: true })));
  return results.flatMap((result, index) => (result === false ? [index] : []));
}

// Unreadable diagram data counts as one failure.
export async function countFailedDiagrams(raw: unknown): Promise<number> {
  if (normalizeSystemDiagrams(raw).format === 'invalid') {
    return UNREADABLE_DIAGRAM_DATA;
  }
  return (await failedDiagramIndexes(raw)).length;
}
