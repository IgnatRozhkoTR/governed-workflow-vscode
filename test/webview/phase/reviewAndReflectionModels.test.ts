import type { ReviewComment } from '@api-types';
import { describe, expect, it } from 'vitest';
import type { Proposal } from '../../../webview-ui/src/api/reflection';
import type { AssignedProfile, VerificationProfile } from '../../../webview-ui/src/api/verification';
import { availableProfiles } from '../../../webview-ui/src/tabs/phase/verificationModel';
import { buildResultJson, countHiddenResolved, countPending, parseJsonText, visibleProposals } from '../../../webview-ui/src/tabs/reflection/proposalsModel';
import { hasResolutionBadge, visibleRoots } from '../../../webview-ui/src/tabs/review/reviewModel';

function comment(id: number, overrides: Partial<ReviewComment>): ReviewComment {
  return { id, parent_id: null, resolved: false, resolution: null, ...overrides } as ReviewComment;
}

function proposal(id: number, status: Proposal['status']): Proposal {
  return { id, status } as Proposal;
}

describe('reviewModel', () => {
  const comments = [comment(1, {}), comment(2, { resolved: true }), comment(3, { parent_id: 1 })];

  it('visibleRoots_shouldHideResolvedAndReplies_whenShowResolvedOff', () => {
    expect(visibleRoots(comments, false).map((root) => root.id)).toEqual([1]);
  });

  it('visibleRoots_shouldIncludeResolvedRoots_whenShowResolvedOn', () => {
    expect(visibleRoots(comments, true).map((root) => root.id)).toEqual([1, 2]);
  });

  it('hasResolutionBadge_shouldIgnoreOpenAndEmptyResolutions', () => {
    expect(hasResolutionBadge(comment(1, { resolution: 'open' }))).toBe(false);
    expect(hasResolutionBadge(comment(1, { resolution: null }))).toBe(false);
    expect(hasResolutionBadge(comment(1, { resolution: 'fixed' }))).toBe(true);
  });
});

describe('proposalsModel', () => {
  const proposals = [proposal(1, 'proposed'), proposal(2, 'executed'), proposal(3, 'rejected')];

  it('visibleProposals_shouldKeepOnlyPending_whenShowResolvedOff', () => {
    expect(visibleProposals(proposals, false).map((item) => item.id)).toEqual([1]);
  });

  it('countHiddenResolved_shouldCountResolved_whenShowResolvedOff', () => {
    expect(countHiddenResolved(proposals, false)).toBe(2);
    expect(countHiddenResolved(proposals, true)).toBe(0);
    expect(countHiddenResolved([proposal(4, 'proposed')], false)).toBe(0);
  });

  it('visibleProposals_shouldKeepAll_whenShowResolvedOn', () => {
    expect(visibleProposals(proposals, true)).toHaveLength(3);
  });

  it('countPending_shouldCountProposedStatus', () => {
    expect(countPending(proposals)).toBe(1);
  });

  it('parseJsonText_shouldReturnParsedValue_whenValidJson', () => {
    expect(parseJsonText('{"a":1}')).toEqual({ a: 1 });
  });

  it('parseJsonText_shouldReturnUndefined_whenEmptyOrEmptyObject', () => {
    expect(parseJsonText(null)).toBeUndefined();
    expect(parseJsonText('  ')).toBeUndefined();
    expect(parseJsonText('{}')).toBeUndefined();
  });

  it('parseJsonText_shouldReturnRawText_whenNotJson', () => {
    expect(parseJsonText('plain note')).toBe('plain note');
  });

  it('buildResultJson_shouldWrapNote_whenNonEmpty', () => {
    expect(buildResultJson('  done  ')).toBe('{"result":"done"}');
  });

  it('buildResultJson_shouldBeUndefined_whenBlank', () => {
    expect(buildResultJson('   ')).toBeUndefined();
  });
});

describe('availableProfiles', () => {
  it('availableProfiles_shouldExcludeAssignedProfiles', () => {
    const all = [{ id: 1 }, { id: 2 }, { id: 3 }] as VerificationProfile[];
    const assigned = [{ id: 2, assignment_id: 9 }] as AssignedProfile[];

    expect(availableProfiles(all, assigned).map((profile) => profile.id)).toEqual([1, 3]);
  });
});
