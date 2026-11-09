import { describe, expect, it } from 'vitest';
import type { ReviewComment } from '../src/api/types';
import { groupReviewThreads, isOutdated, threadKey } from '../src/comments/commentMapping';
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
    created_at: '2026-01-01T00:00:00Z',
    resolved: false,
    resolved_at: null,
    resolution: null,
    ...overrides,
  };
}

describe('threadKey', () => {
  it('should join file path and start line when building a key', () => {
    expect(threadKey('src/a.ts', 10)).toBe('src/a.ts#10');
  });
});

describe('groupReviewThreads', () => {
  it('should keep the server line numbers unchanged when mapping a thread', () => {
    const threads = groupReviewThreads([comment({ id: 1, line_start: 5, line_end: 8 })]);

    const [thread] = threads.get('src/a.ts#5') ?? [];
    expect(thread.lineStart).toBe(5);
    expect(thread.lineEnd).toBe(8);
  });

  it('should use the start line as the end line when line_end is null', () => {
    const threads = groupReviewThreads([comment({ line_start: 5, line_end: null })]);

    expect(threads.get('src/a.ts#5')?.[0].lineEnd).toBe(5);
  });

  it('should clamp the end line to the start line when line_end is before it', () => {
    const threads = groupReviewThreads([comment({ line_start: 5, line_end: 2 })]);

    expect(threads.get('src/a.ts#5')?.[0].lineEnd).toBe(5);
  });

  it('should attach nested replies ordered by id when the root carries replies', () => {
    const replies = [
      { id: 7, text: 'second', author: 'claude', created_at: 't' },
      { id: 3, text: 'first', author: 'user', created_at: 't' },
    ];

    const threads = groupReviewThreads([comment({ id: 2, replies: replies as ReviewComment['replies'] })]);

    expect(threads.get('src/a.ts#10')?.[0].replies.map((reply) => reply.id)).toEqual([3, 7]);
  });

  it('should attach flat rows as replies when they reference the root by parent_id', () => {
    const threads = groupReviewThreads([
      comment({ id: 1 }),
      comment({ id: 2, parent_id: 1, file_path: null, line_start: null, text: 'reply' }),
    ]);

    expect(threads.get('src/a.ts#10')?.[0].replies.map((reply) => reply.text)).toEqual(['reply']);
  });

  it('should not duplicate a reply when it appears both nested and flat', () => {
    const nested = { id: 2, text: 'reply', author: 'user', created_at: 't' };

    const threads = groupReviewThreads([
      comment({ id: 1, replies: [nested] as ReviewComment['replies'] }),
      comment({ id: 2, parent_id: 1, file_path: null, line_start: null, text: 'reply' }),
    ]);

    expect(threads.get('src/a.ts#10')?.[0].replies).toHaveLength(1);
  });

  it('should skip comments without a file path or line when building threads', () => {
    const threads = groupReviewThreads([
      comment({ id: 1, file_path: null }),
      comment({ id: 2, line_start: null }),
      comment({ id: 3, file_path: '' }),
    ]);

    expect(threads.size).toBe(0);
  });

  it('should group multiple roots under one key when they share file and start line', () => {
    const threads = groupReviewThreads([comment({ id: 1 }), comment({ id: 2 })]);

    expect(threads.get('src/a.ts#10')?.map((thread) => thread.root.id)).toEqual([1, 2]);
  });

  it('should keep resolved state on the root when the thread is resolved', () => {
    const threads = groupReviewThreads([comment({ resolved: true })]);

    expect(threads.get('src/a.ts#10')?.[0].root.resolved).toBe(true);
  });

  it('should return an empty map when there are no comments', () => {
    expect(groupReviewThreads([]).size).toBe(0);
  });
});

describe('isOutdated', () => {
  it('should be false when the comment has no stored hash', () => {
    expect(isOutdated({ line_hash: null }, 'anything')).toBe(false);
  });

  it('should be false when the stored hash matches the current line', () => {
    expect(isOutdated({ line_hash: lineHash('  return x;') }, '  return x;')).toBe(false);
  });

  it('should be true when the current line differs from the stored hash', () => {
    expect(isOutdated({ line_hash: '2850cf58' }, '  return y;')).toBe(true);
  });
});
