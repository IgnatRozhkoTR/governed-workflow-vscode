export interface DiagramEntry {
  readonly title: string;
  readonly source: string;
}

export type SystemDiagramFormat = 'empty' | 'invalid' | 'ok';

const INIT_DIRECTIVE = /%%\{init:[\s\S]*?\}%%/g;
const RECT_RGB = /rect\s+rgb\s*\([^)]+\)/g;
const RECT_HEX = /rect\s+#[0-9a-fA-F]{3,8}/g;
const DARK_RECT_COLORS = ['rgba(40, 40, 60, 0.5)', 'rgba(40, 60, 40, 0.5)', 'rgba(60, 40, 40, 0.5)'];
const LIGHT_RECT_COLORS = ['rgba(200, 210, 230, 0.3)', 'rgba(200, 230, 210, 0.3)', 'rgba(230, 210, 200, 0.3)'];

function isDiagramRecord(value: unknown): value is { title?: unknown; diagram?: unknown } {
  return typeof value === 'object' && value !== null;
}

export function normalizeSystemDiagrams(raw: unknown): { readonly format: SystemDiagramFormat; readonly entries: readonly DiagramEntry[] } {
  if (raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0)) {
    return { format: 'empty', entries: [] };
  }
  if (typeof raw === 'string') {
    return { format: 'ok', entries: [{ title: '', source: raw }].filter((entry) => entry.source.trim() !== '') };
  }
  if (!Array.isArray(raw)) {
    return { format: 'invalid', entries: [] };
  }
  const entries = raw.filter(isDiagramRecord).flatMap((item) => {
    const source = typeof item.diagram === 'string' ? item.diagram : '';
    return source.trim() === '' ? [] : [{ title: typeof item.title === 'string' ? item.title : '', source }];
  });
  return { format: 'ok', entries };
}

export function prepareDiagramSource(source: string, isLight: boolean): string {
  const colors = isLight ? LIGHT_RECT_COLORS : DARK_RECT_COLORS;
  let colorIndex = 0;
  const nextRect = (): string => `rect ${colors[colorIndex++ % colors.length]}`;
  return source
    .replace(INIT_DIRECTIVE, '')
    .replace(RECT_RGB, nextRect)
    .replace(RECT_HEX, nextRect)
    .replace(/\\n/g, '<br/>')
    .trim();
}
