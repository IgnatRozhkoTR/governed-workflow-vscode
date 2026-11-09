import { describe, expect, it } from 'vitest';
import type { ReviewComment } from '../src/api/types';
import {
  areaLabel,
  countOpenComments,
  groupCommentsByArea,
  isCodeComment,
  matchesFilter,
  panelNavFor,
} from '../src/comments/commentGrouping';

function comment(overrides: Partial<ReviewComment>): ReviewComment {
  return {
    id: 1,
    parent_id: null,
    scope: 'plan',
    target: 'Entire plan',
    file_path: null,
    line_start: null,
    line_end: null,
    line_hash: null,
    text: 'text',
    author: 'user',
    type: null,
    created_at: '2026-01-01T00:00:00',
    resolved: false,
    resolved_at: null,
    resolution: null,
    replies: [],
    ...overrides,
  };
}

const byTarget = {
  'review:src/a.ts': [
    comment({ id: 4, scope: 'review', target: 'src/a.ts', file_path: 'src/a.ts', line_start: 3 }),
    comment({ id: 6, scope: 'review', target: 'src/a.ts', file_path: 'src/a.ts', line_start: 9, resolved: true }),
  ],
  'plan:Task: build': [comment({ id: 5, target: 'Task: build' })],
  'plan:Entire plan': [comment({ id: 2 })],
  'custom:x': [comment({ id: 1, scope: 'custom', target: 'x' })],
};

describe('groupCommentsByArea', () => {
  it('should order areas by workflow position and put unknown scopes last', () => {
    const areas = groupCommentsByArea(byTarget, 'all');

    expect(areas.map((area) => area.scope)).toEqual(['plan', 'review', 'custom']);
  });

  it('should order targets by their first comment id within an area', () => {
    const [plan] = groupCommentsByArea(byTarget, 'all');

    expect(plan.targets.map((group) => group.target)).toEqual(['Entire plan', 'Task: build']);
  });

  it('should keep only open comments and count them when filtering open', () => {
    const code = groupCommentsByArea(byTarget, 'open').find((area) => area.scope === 'review');

    expect(code?.targets[0].comments.map((entry) => entry.id)).toEqual([4]);
    expect(code?.openCount).toBe(1);
  });

  it('should drop areas without matching comments when filtering resolved', () => {
    const areas = groupCommentsByArea(byTarget, 'resolved');

    expect(areas.map((area) => area.scope)).toEqual(['review']);
    expect(areas[0]).toMatchObject({ openCount: 0, commentCount: 1 });
  });

  it('should count open and total comments per area and target when showing all', () => {
    const code = groupCommentsByArea(byTarget, 'all').find((area) => area.scope === 'review');

    expect(code).toMatchObject({ openCount: 1, commentCount: 2 });
    expect(code?.targets[0].openCount).toBe(1);
  });

  it('should group a null target under the empty target', () => {
    const [area] = groupCommentsByArea({ 'plan:': [comment({ target: null })] }, 'all');

    expect(area.targets[0].target).toBe('');
  });

  it('should return no areas when there are no comments', () => {
    expect(groupCommentsByArea({}, 'all')).toEqual([]);
  });
});

describe('countOpenComments', () => {
  it('should count unresolved roots across all areas', () => {
    expect(countOpenComments(byTarget)).toBe(4);
  });
});

describe('matchesFilter', () => {
  it('should match by resolved state for each filter', () => {
    expect(matchesFilter({ resolved: false }, 'open')).toBe(true);
    expect(matchesFilter({ resolved: false }, 'resolved')).toBe(false);
    expect(matchesFilter({ resolved: true }, 'all')).toBe(true);
  });
});

describe('areaLabel', () => {
  it('should name the review scope Code and capitalise unknown scopes', () => {
    expect(areaLabel('review')).toBe('Code');
    expect(areaLabel('custom')).toBe('Custom');
  });
});

describe('isCodeComment', () => {
  it('should treat review comments with a path as code comments', () => {
    expect(isCodeComment({ scope: 'review', file_path: null, target: 'src/dir' })).toBe(true);
    expect(isCodeComment({ scope: 'plan', file_path: null, target: 'Task: x' })).toBe(false);
  });
});

describe('panelNavFor', () => {
  it('should open the tab that renders the scope with the comment thread focused', () => {
    expect(panelNavFor({ scope: 'criteria', target: 'criterion:7' })).toEqual({
      tab: 'planning',
      comment: { scope: 'criteria', target: 'criterion:7' },
    });
  });

  it('should use an empty target when the comment has none', () => {
    expect(panelNavFor({ scope: 'research', target: null })?.comment).toEqual({ scope: 'research', target: '' });
  });

  it('should return undefined when no panel tab shows the scope', () => {
    expect(panelNavFor({ scope: 'custom', target: 'x' })).toBeUndefined();
  });
});
