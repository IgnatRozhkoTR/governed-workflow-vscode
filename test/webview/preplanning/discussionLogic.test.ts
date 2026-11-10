import type { Discussion, ResearchEntry } from '@api-types';
import { describe, expect, it } from 'vitest';
import {
  countOpenDiscussions,
  countPendingResearchDiscussions,
  discussionTitle,
  distinctDiscussionTitle,
  isDiscussionDone,
  provenDiscussionIds,
  visibleDiscussions,
} from '../../../webview-ui/src/tabs/preplanning/discussionLogic';
import { impactSections } from '../../../webview-ui/src/tabs/preplanning/impact';

function discussion(id: number, type: string, status: string): Discussion {
  return { id, parent_id: null, text: `d${id}`, author: 'user', status, type, hidden: 0, created_at: '', resolved_at: null, replies: [] };
}

function research(id: number, proven: number, discussionId: number | null): ResearchEntry {
  return { id, topic: 't', summary: '', findings: [], proven, proven_notes: null, discussion_id: discussionId, created_at: '' };
}

const ALL = [discussion(1, 'general', 'resolved'), discussion(2, 'general', 'open'), discussion(3, 'research', 'open'), discussion(4, 'research', 'open')];
const PROVEN = provenDiscussionIds([research(10, 1, 3), research(11, -1, 4), research(12, 0, null)]);

describe('discussion filtering', () => {
  it('collects only the discussions of verified research', () => {
    expect([...PROVEN]).toEqual([3]);
  });

  it('hides resolved and proven discussions by default and lists open ones first', () => {
    const ids = visibleDiscussions(ALL, PROVEN, { showResolved: false, showProven: false }).map((d) => d.id);
    expect(ids).toEqual([2, 4]);
  });

  it('shows everything and keeps open discussions first when both toggles are on', () => {
    const ids = visibleDiscussions(ALL, PROVEN, { showResolved: true, showProven: true }).map((d) => d.id);
    expect(ids).toEqual([2, 3, 4, 1]);
  });

  it('counts open discussions and unverified research discussions', () => {
    expect(countOpenDiscussions(ALL, PROVEN)).toBe(2);
    expect(countPendingResearchDiscussions(ALL, PROVEN)).toBe(1);
  });

  it('countOpenDiscussions_shouldSkipProvenResearch_whenItsStatusIsStillOpen', () => {
    expect(countOpenDiscussions([discussion(3, 'research', 'open')], PROVEN)).toBe(0);
    expect(countOpenDiscussions([discussion(3, 'research', 'open')], new Set())).toBe(1);
  });

  it('discussionTitle_shouldCollapseWhitespaceAndTruncate_whenBodyIsLong', () => {
    const long = { ...discussion(5, 'general', 'open'), text: `first\nline ${'x'.repeat(100)}` };
    const title = discussionTitle(long);
    expect(title.startsWith('first line x')).toBe(true);
    expect(title).toHaveLength(80);
    expect(title.endsWith('…')).toBe(true);
    expect(discussionTitle({ ...long, text: '  short  ' })).toBe('short');
  });

  it('distinctDiscussionTitle_shouldBeUndefined_whenMessageIsASingleLine', () => {
    expect(distinctDiscussionTitle({ ...discussion(6, 'general', 'open'), text: 'Should we cache prices?' })).toBeUndefined();
    expect(distinctDiscussionTitle({ ...discussion(6, 'general', 'open'), text: `Long single line ${'x'.repeat(120)}` })).toBeUndefined();
  });

  it('distinctDiscussionTitle_shouldReturnFirstLine_whenMoreTextFollows', () => {
    const text = '  Pricing cache\n\nShould prices be cached per cart or per session?';
    expect(distinctDiscussionTitle({ ...discussion(7, 'general', 'open'), text })).toBe('Pricing cache');
  });

  it('distinctDiscussionTitle_shouldBeUndefined_whenOnlyBlankLinesFollow', () => {
    expect(distinctDiscussionTitle({ ...discussion(8, 'general', 'open'), text: 'Just a question\n   \n' })).toBeUndefined();
  });

  it('treats research as done when proven and others when resolved', () => {
    expect(isDiscussionDone(ALL[2], PROVEN)).toBe(true);
    expect(isDiscussionDone(ALL[3], PROVEN)).toBe(false);
    expect(isDiscussionDone(ALL[0], PROVEN)).toBe(true);
  });
});

describe('impactSections', () => {
  it('returns only present known sections in web order', () => {
    const sections = impactSections({ open_questions: 'q', affected_flows: 'f', api_changes: '', ticket_gaps: [], other: 'x' });
    expect(sections.map((s) => s.key)).toEqual(['affected_flows', 'open_questions']);
  });

  it('returns nothing for non-object analyses', () => {
    expect(impactSections(null)).toEqual([]);
    expect(impactSections('text')).toEqual([]);
  });

  it('keeps structured values untouched', () => {
    const value = [{ name: 'a' }];
    expect(impactSections({ api_changes: value })[0].value).toBe(value);
  });
});
