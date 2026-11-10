import { describe, expect, it } from 'vitest';
import type { Discussion, ResearchEntry } from '../../../src/api/types';
import { selectStateAttention } from '../../../webview-ui/src/store/attention';
import { makeComment, makeState } from '../../support/fixtures';

function research(id: number, proven: number, discussionId: number | null): ResearchEntry {
  return { id, topic: 't', summary: '', findings: [], proven, proven_notes: null, discussion_id: discussionId, created_at: '' };
}

function discussion(id: number, type: string, status: string): Discussion {
  return { id, parent_id: null, text: `d${id}`, author: 'user', status, type, hidden: 0, created_at: '', resolved_at: null, replies: [] };
}

describe('selectStateAttention', () => {
  it('selectStateAttention_shouldReturnZeros_whenNoWorkspaceStateIsLoaded', () => {
    expect(selectStateAttention(null)).toEqual({ openComments: 0, pendingResearch: 0, openDiscussions: 0 });
  });

  it('selectStateAttention_shouldCountOpenItems_acrossAllScopes', () => {
    const state = makeState({
      comments: {
        'review:a.ts': [makeComment({ id: 1, resolved: false }), makeComment({ id: 2, resolved: true })],
        'plan:execution': [makeComment({ id: 3, resolved: false })],
      },
      research: [research(10, 1, 3), research(11, -1, null), research(12, 0, 4)],
      discussions: [discussion(1, 'general', 'open'), discussion(2, 'general', 'resolved'), discussion(3, 'research', 'open'), discussion(4, 'research', 'open')],
    });
    expect(selectStateAttention(state)).toEqual({ openComments: 2, pendingResearch: 1, openDiscussions: 2 });
  });
});
