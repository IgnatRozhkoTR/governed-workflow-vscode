export type Proof =
  | { readonly kind: 'code'; readonly file: string; readonly lineStart?: number; readonly lineEnd?: number; readonly snippetStart?: number; readonly snippetEnd?: number; readonly snippet?: string }
  | { readonly kind: 'web'; readonly url: string; readonly title?: string; readonly quote?: string }
  | { readonly kind: 'diff'; readonly commit: string; readonly file?: string; readonly description?: string }
  | { readonly kind: 'unknown'; readonly value: unknown }
  | { readonly kind: 'none' };

export interface Finding {
  readonly summary: string;
  readonly details: string;
  readonly proof: Proof;
}

export interface ParsedFindings {
  readonly findings: readonly Finding[];
  readonly unparsed?: unknown;
}

const SUMMARY_TARGET_LENGTH = 60;
const COMMIT_ABBREVIATION_LENGTH = 7;
const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdx'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseCodeProof(file: string, proof: Record<string, unknown>): Proof {
  return {
    kind: 'code',
    file,
    lineStart: positive(proof.line_start),
    lineEnd: positive(proof.line_end),
    snippetStart: positive(proof.snippet_start),
    snippetEnd: positive(proof.snippet_end),
    snippet: text(proof.snippet),
  };
}

export function parseProof(raw: unknown): Proof {
  if (raw === undefined || raw === null || (isRecord(raw) && Object.keys(raw).length === 0)) {
    return { kind: 'none' };
  }
  if (!isRecord(raw)) {
    return { kind: 'unknown', value: raw };
  }
  const type = text(raw.type) ?? 'code';
  const file = text(raw.file);
  if (type === 'code' && file !== undefined) {
    return parseCodeProof(file, raw);
  }
  const url = text(raw.url);
  if (type === 'web' && url !== undefined) {
    return { kind: 'web', url, title: text(raw.title), quote: text(raw.quote) };
  }
  const commit = text(raw.commit);
  if (type === 'diff' && commit !== undefined) {
    return { kind: 'diff', commit, file, description: text(raw.description) };
  }
  if (file !== undefined && !['web', 'diff'].includes(type)) {
    return parseCodeProof(file, raw);
  }
  return { kind: 'unknown', value: raw };
}

function parseFinding(raw: unknown): Finding {
  if (typeof raw === 'string') {
    return { summary: raw, details: '', proof: { kind: 'none' } };
  }
  if (!isRecord(raw)) {
    return { summary: '', details: '', proof: { kind: 'unknown', value: raw } };
  }
  return { summary: text(raw.summary) ?? '', details: text(raw.details) ?? '', proof: parseProof(raw.proof) };
}

function decode(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export function parseFindings(raw: unknown): ParsedFindings {
  const decoded = decode(raw);
  if (Array.isArray(decoded)) {
    return { findings: decoded.map(parseFinding) };
  }
  if (decoded === null || decoded === undefined || decoded === '') {
    return { findings: [] };
  }
  return { findings: [], unparsed: decoded };
}

export function findingCommentTarget(summary: string): string {
  return `Finding: ${summary.substring(0, SUMMARY_TARGET_LENGTH)}`;
}

export function abbreviateCommit(commit: string): string {
  return commit.substring(0, COMMIT_ABBREVIATION_LENGTH);
}

export function isMarkdownPath(path: string): boolean {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return MARKDOWN_EXTENSIONS.includes(extension);
}

export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/');
}

export interface ProofBadgeSpec {
  readonly labelKey: string;
  readonly tone: 'success' | 'danger' | 'warning';
}

export function proofBadgeSpec(proven: number): ProofBadgeSpec {
  if (proven === 1) {
    return { labelKey: 'badges.verified', tone: 'success' };
  }
  return proven === -1 ? { labelKey: 'badges.rejected', tone: 'danger' } : { labelKey: 'badges.pending', tone: 'warning' };
}
