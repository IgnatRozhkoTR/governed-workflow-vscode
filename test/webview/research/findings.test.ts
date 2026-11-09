import { describe, expect, it } from 'vitest';
import {
  abbreviateCommit,
  findingCommentTarget,
  isMarkdownPath,
  parseFindings,
  parseProof,
  proofBadgeSpec,
} from '../../../webview-ui/src/tabs/research/findings';

describe('parseProof', () => {
  it('parses a code proof with snippet range', () => {
    expect(parseProof({ type: 'code', file: 'a.py', line_start: 3, line_end: 9, snippet_start: 1, snippet_end: 12 })).toMatchObject({
      kind: 'code', file: 'a.py', lineStart: 3, lineEnd: 9, snippetStart: 1, snippetEnd: 12,
    });
  });

  it('treats a typeless proof with a file as code and keeps a legacy inline snippet', () => {
    expect(parseProof({ file: 'a.py', snippet: 'x = 1' })).toMatchObject({ kind: 'code', snippet: 'x = 1' });
  });

  it('parses web and diff proofs', () => {
    expect(parseProof({ type: 'web', url: 'https://x.test', title: 'T', quote: 'q' })).toEqual({ kind: 'web', url: 'https://x.test', title: 'T', quote: 'q' });
    expect(parseProof({ type: 'diff', commit: 'abcdef123', file: 'f', description: 'd' })).toMatchObject({ kind: 'diff', commit: 'abcdef123', description: 'd' });
  });

  it('returns none for an empty proof and unknown for unusable shapes', () => {
    expect(parseProof({})).toEqual({ kind: 'none' });
    expect(parseProof(undefined)).toEqual({ kind: 'none' });
    expect(parseProof({ type: 'web' })).toMatchObject({ kind: 'unknown' });
    expect(parseProof(42)).toEqual({ kind: 'unknown', value: 42 });
  });
});

describe('parseFindings', () => {
  it('maps findings and tolerates plain strings', () => {
    const { findings } = parseFindings([{ summary: 's', details: 'd', proof: { file: 'a' } }, 'plain']);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ summary: 's', details: 'd' });
    expect(findings[1]).toEqual({ summary: 'plain', details: '', proof: { kind: 'none' } });
  });

  it('decodes JSON strings and flags unparseable shapes', () => {
    expect(parseFindings('[{"summary":"x"}]').findings[0].summary).toBe('x');
    expect(parseFindings({ a: 1 })).toEqual({ findings: [], unparsed: { a: 1 } });
    expect(parseFindings(null)).toEqual({ findings: [] });
  });
});

describe('helpers', () => {
  it('truncates the comment target to 60 characters like the web', () => {
    expect(findingCommentTarget('x'.repeat(80))).toBe(`Finding: ${'x'.repeat(60)}`);
  });

  it('abbreviates commits and detects markdown paths', () => {
    expect(abbreviateCommit('0123456789')).toBe('0123456');
    expect(isMarkdownPath('docs/A.MD')).toBe(true);
    expect(isMarkdownPath('a.py')).toBe(false);
  });

  it('maps proven values to badge specs', () => {
    expect(proofBadgeSpec(1).tone).toBe('success');
    expect(proofBadgeSpec(-1).tone).toBe('danger');
    expect(proofBadgeSpec(0).tone).toBe('warning');
  });
});
