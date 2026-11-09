import { describe, expect, it } from 'vitest';
import type { ReviewComment } from '../src/api/types';
import {
  authorLabel,
  codeThreads,
  hashLines,
  isOutdated,
  newFileComment,
  newLineComment,
  placeLines,
  provisionalRoot,
  resolutionLabel,
  rootComments,
  threadSignature,
} from '../src/comments/commentMapping';
import { lineHash } from '../src/comments/lineHash';

function comment(overrides: Partial<ReviewComment>): ReviewComment {
  return {
    id: 1,
    parent_id: null,
    scope: 'review',
    target: 'src/a.ts',
    file_path: 'src/a.ts',
    line_start: 10,
    line_end: 10,
    line_hash: null,
    text: 'text',
    author: 'user',
    type: null,
    created_at: '2026-01-01T00:00:00',
    resolved: false,
    resolved_at: null,
    resolution: 'open',
    replies: [],
    ...overrides,
  };
}

function reply(id: number, text: string): NonNullable<ReviewComment['replies']>[number] {
  return { id, text, author: 'agent', created_at: 't', status: 'open', resolved_at: null };
}

describe('rootComments', () => {
  it('should flatten all targets sorted by id and drop replies when grouped by scope and target', () => {
    const roots = rootComments({
      'plan:Entire plan': [comment({ id: 3, scope: 'plan' })],
      'review:src/a.ts': [comment({ id: 1 }), comment({ id: 2, parent_id: 1 })],
    });

    expect(roots.map((root) => root.id)).toEqual([1, 3]);
  });
});

describe('codeThreads', () => {
  it('should map a line comment onto its file and line span when it is in the review scope', () => {
    const [thread] = codeThreads({ 'review:src/a.ts': [comment({ line_start: 5, line_end: 8 })] });

    expect(thread.filePath).toBe('src/a.ts');
    expect(thread.lines).toEqual({ start: 5, end: 8 });
  });

  it('should map a file comment without lines when it only has a target', () => {
    const [thread] = codeThreads({ 'review:src/b.ts': [comment({ target: 'src/b.ts', file_path: null, line_start: null })] });

    expect(thread.filePath).toBe('src/b.ts');
    expect(thread.lines).toBeUndefined();
  });

  it('should clamp the end line to the start line when line_end is missing or before it', () => {
    const threads = codeThreads({
      'review:src/a.ts': [comment({ id: 1, line_start: 5, line_end: null }), comment({ id: 2, line_start: 5, line_end: 2 })],
    });

    expect(threads.map((thread) => thread.lines)).toEqual([{ start: 5, end: 5 }, { start: 5, end: 5 }]);
  });

  it('should skip comments of other scopes when building code threads', () => {
    expect(codeThreads({ 'plan:Task: x': [comment({ scope: 'plan', target: 'Task: x', file_path: null })] })).toEqual([]);
  });

  it('should skip review comments without any path when building code threads', () => {
    expect(codeThreads({ 'review:': [comment({ target: null, file_path: null })] })).toEqual([]);
  });

  it('should order replies by id when the server returns them unordered', () => {
    const [thread] = codeThreads({ 'review:src/a.ts': [comment({ replies: [reply(7, 'second'), reply(3, 'first')] })] });

    expect(thread.replies.map((message) => message.id)).toEqual([3, 7]);
  });
});

describe('placeLines', () => {
  const document = ['import x;', '', 'function f() {', '  return x;', '}'];
  const hashes = hashLines(document);

  it('should keep the stored lines when the comment has no hash', () => {
    expect(placeLines({ start: 2, end: 3 }, null, hashes)).toEqual({ lines: { start: 2, end: 3 }, isOutdated: false });
  });

  it('should keep the stored lines when the hash still matches the start line', () => {
    const placement = placeLines({ start: 4, end: 5 }, lineHash('  return x;'), hashes);

    expect(placement).toEqual({ lines: { start: 4, end: 5 }, isOutdated: false });
  });

  it('should shift the whole range to the moved line when the hash is found elsewhere', () => {
    const placement = placeLines({ start: 1, end: 2 }, lineHash('  return x;'), hashes);

    expect(placement).toEqual({ lines: { start: 4, end: 5 }, isOutdated: false });
  });

  it('should pick the nearest match when the line text appears more than once', () => {
    const repeated = hashLines(['}', 'a', 'b', 'c', 'd', '}', 'e']);

    expect(placeLines({ start: 5, end: 5 }, lineHash('}'), repeated).lines).toEqual({ start: 6, end: 6 });
  });

  it('should mark the comment outdated at its stored lines when the hash is not found', () => {
    const placement = placeLines({ start: 3, end: 3 }, lineHash('deleted line'), hashes);

    expect(placement).toEqual({ lines: { start: 3, end: 3 }, isOutdated: true });
  });

  it('should clamp to the last line when the document became shorter', () => {
    const placement = placeLines({ start: 40, end: 42 }, lineHash('gone'), hashes);

    expect(placement.lines).toEqual({ start: 5, end: 5 });
  });

  it('should clamp a relocated range that would run past the end of the document', () => {
    const placement = placeLines({ start: 1, end: 4 }, lineHash('  return x;'), hashes);

    expect(placement.lines).toEqual({ start: 4, end: 5 });
  });
});

describe('isOutdated', () => {
  it('should be false when the comment has no stored hash', () => {
    expect(isOutdated({ line_hash: null }, 'anything')).toBe(false);
  });

  it('should be true when the current line differs from the stored hash', () => {
    expect(isOutdated({ line_hash: lineHash('  return x;') }, '  return y;')).toBe(true);
  });
});

describe('newLineComment', () => {
  it('should build the web line comment shape with the start line hash', () => {
    const created = newLineComment('src/a.ts', { start: 3, end: 6 }, '  return x;', '  please fix  ');

    expect(created).toEqual({
      scope: 'review',
      target: 'src/a.ts',
      file_path: 'src/a.ts',
      line_start: 3,
      line_end: 6,
      line_hash: lineHash('  return x;'),
      text: 'please fix',
      author: 'user',
    });
  });
});

describe('newFileComment', () => {
  it('should target the path without file_path or lines like the web file comment', () => {
    expect(newFileComment('src/dir', ' note ')).toEqual({ scope: 'review', target: 'src/dir', text: 'note', author: 'user' });
  });
});

describe('provisionalRoot', () => {
  it('should mirror the posted comment as an open root when the server returned its id', () => {
    const root = provisionalRoot(9, newFileComment('src/a.ts', 'note'), '2026-01-01T00:00:00Z');

    expect(root).toMatchObject({ id: 9, target: 'src/a.ts', file_path: null, line_start: null, resolved: false, resolution: 'open' });
  });
});

describe('threadSignature', () => {
  it('should stay equal when nothing visible changed', () => {
    const [left] = codeThreads({ k: [comment({})] });
    const [right] = codeThreads({ k: [comment({})] });

    expect(threadSignature(left)).toBe(threadSignature(right));
  });

  it('should change when a reply arrives or the thread is resolved', () => {
    const [base] = codeThreads({ k: [comment({})] });
    const [replied] = codeThreads({ k: [comment({ replies: [reply(2, 'done')] })] });
    const [resolved] = codeThreads({ k: [comment({ resolved: true })] });

    expect(threadSignature(replied)).not.toBe(threadSignature(base));
    expect(threadSignature(resolved)).not.toBe(threadSignature(base));
  });
});

describe('authorLabel', () => {
  it('should capitalise the first word and split on dashes like the web fallback', () => {
    expect(authorLabel('correctness-reviewer')).toBe('Correctness reviewer');
    expect(authorLabel('user')).toBe('User');
  });
});

describe('resolutionLabel', () => {
  it('should hide the open resolution and humanise the others', () => {
    expect(resolutionLabel('open')).toBeUndefined();
    expect(resolutionLabel(null)).toBeUndefined();
    expect(resolutionLabel('out_of_scope')).toBe('out of scope');
  });
});
