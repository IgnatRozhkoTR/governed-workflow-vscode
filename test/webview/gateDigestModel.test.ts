import { describe, expect, it } from 'vitest';
import type { ResearchEntry } from '../../src/api/types';
import {
  findingsTally, planWarnings, preplanningWarnings, presentFindings, researchCounts, reviewThreadFindings, splitDigestRow, withWarnings, verificationWarnings, uncommittedFileNotes, committedFileCount, type DigestItem,
} from '../../webview-ui/src/shell/gateDigestModel';
import { makeComment } from '../support/fixtures';

function research(proven: number): ResearchEntry {
  return { id: proven, topic: 't', summary: '', findings: null, proven, proven_notes: null, discussion_id: null, created_at: '' };
}

function item(id: string): DigestItem {
  return { id, icon: 'info', chip: id, detail: id };
}

describe('researchCounts', () => {
  it('researchCounts_shouldSplitProvenRejectedAndUnproven', () => {
    expect(researchCounts([research(1), research(-1), research(0), research(0)])).toEqual({ proven: 1, rejected: 1, unproven: 2, total: 4 });
  });
});

describe('preplanningWarnings', () => {
  it('preplanningWarnings_shouldWarnAboutRejectedUnprovenResearchAndOpenDiscussions', () => {
    const warnings = preplanningWarnings({ proven: 1, rejected: 1, unproven: 2, total: 4 }, 3);

    expect(warnings.map((warning) => [warning.id, warning.count])).toEqual([['research-rejected', 1], ['research-unproven', 2], ['discussions', 3]]);
    expect(warnings.map((warning) => warning.nav.tab)).toEqual(['preplanning', 'preplanning', 'preplanning']);
  });

  it('preplanningWarnings_shouldBeEmpty_whenAllResearchIsProvenAndNoDiscussionIsOpen', () => {
    expect(preplanningWarnings({ proven: 2, rejected: 0, unproven: 0, total: 2 }, 0)).toEqual([]);
  });
});

describe('planWarnings', () => {
  it('planWarnings_shouldWarnAboutRejectedCriteriaDiagramsAndEmptyScope', () => {
    const warnings = planWarnings({ criteria: { total: 6, accepted: 3, pending: 2, rejected: 1 }, failedDiagrams: 1, isScopeEmpty: true });

    expect(warnings.map((warning) => [warning.id, warning.count])).toEqual([
      ['criteria-rejected', 1], ['diagrams-failed', 1], ['scope-empty', 1],
    ]);
    expect(warnings.find((warning) => warning.id === 'scope-empty')?.nav).toEqual({ tab: 'planning', anchor: 'plan-scope' });
    expect(warnings.find((warning) => warning.id === 'diagrams-failed')?.nav).toEqual({ tab: 'planning', anchor: 'plan-diagram-failed' });
  });

  it('planWarnings_shouldNotWarnAboutPendingCriteria_sincePlanApprovalAcceptsThem', () => {
    expect(planWarnings({ criteria: { total: 6, accepted: 0, pending: 6, rejected: 0 }, failedDiagrams: 0, isScopeEmpty: false })).toEqual([]);
  });

  it('planWarnings_shouldRaiseNothing_whileCountsAreStillLoading', () => {
    expect(planWarnings({ isScopeEmpty: false })).toEqual([]);
  });
});

describe('withWarnings', () => {
  it('withWarnings_shouldPutWarningsFirstAndReplaceTheChipTheyRestate', () => {
    const merged = withWarnings([item('research'), item('discussions'), item('impact')], [item('discussions'), item('research-rejected')]);

    expect(merged.map((entry) => entry.id)).toEqual(['discussions', 'research-rejected', 'research', 'impact']);
  });

  it('withWarnings_shouldKeepTheRestatedChipsTooltip_whenAWarningReplacesIt', () => {
    const plain = { ...item('criteria'), detail: 'total 6, pending 6' };
    const warning = { ...item('criteria'), chip: 'pending 6', isWarning: true };

    const [merged] = withWarnings([plain], [warning]);

    expect(merged).toMatchObject({ id: 'criteria', chip: 'pending 6', detail: 'total 6, pending 6', isWarning: true });
  });
});

describe('splitDigestRow', () => {
  it('splitDigestRow_shouldKeepEveryWarningApartFromCounts_inOrder', () => {
    const row = splitDigestRow([{ ...item('a'), isWarning: true }, { ...item('b'), isWarning: true }, item('c'), item('d')]);

    expect(row.warnings.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(row.counts.map((entry) => entry.id)).toEqual(['c', 'd']);
  });

  it('splitDigestRow_shouldReturnEmptyWarnings_whenNoItemWarns', () => {
    expect(splitDigestRow([item('a')])).toEqual({ warnings: [], counts: [item('a')] });
    expect(splitDigestRow([])).toEqual({ warnings: [], counts: [] });
  });
});

describe('reviewThreadFindings', () => {
  it('reviewThreadFindings_shouldBlockApproval_whenThreadsAreOpenOutsideYolo', () => {
    const { warnings, blockers } = reviewThreadFindings(8, 0, false);

    expect(warnings).toEqual([]);
    expect(blockers).toEqual([{ id: 'threads', messageKey: 'vsc.blocker.threads', count: 8, hasPluralForms: true, nav: { tab: 'review', anchor: 'review-blocking' } }]);
  });

  it('reviewThreadFindings_shouldOnlyWarn_whenYoloSkipsTheServerGuard', () => {
    const { warnings, blockers } = reviewThreadFindings(2, 0, true);

    expect(blockers).toEqual([]);
    expect(warnings.map((warning) => [warning.id, warning.count])).toEqual([['threads', 2]]);
  });

  it('reviewThreadFindings_shouldRaiseNothing_whenNoThreadIsOpen', () => {
    expect(reviewThreadFindings(0, 0, false)).toEqual({ warnings: [], blockers: [] });
  });

  it('reviewThreadFindings_shouldNameThreadsResolvedWithoutAResult_whenSomeStillBlock', () => {
    const { blockers } = reviewThreadFindings(8, 1, false);

    expect(blockers.map((blocker) => [blocker.messageKey, blocker.count, blocker.params])).toEqual([['vsc.blocker.threadsWithResolved', 8, { resolved: 1 }]]);
  });
});

describe('verificationWarnings', () => {
  it('verificationWarnings_shouldWarn_whenVerificationNeverRanOrFailed', () => {
    expect(verificationWarnings(undefined, 'not run').map((warning) => [warning.id, warning.params])).toEqual([['verification', { status: 'not run' }]]);
    expect(verificationWarnings('failed', 'Failed')).toHaveLength(1);
    expect(verificationWarnings('timeout', 'Timeout')).toHaveLength(1);
  });

  it('verificationWarnings_shouldStayQuiet_whenLastRunPassedOrOnlyWarned', () => {
    expect(verificationWarnings('passed', 'Passed')).toEqual([]);
    expect(verificationWarnings('warning', 'Warning')).toEqual([]);
  });
});

describe('uncommittedFileNotes', () => {
  it('uncommittedFileNotes_shouldCountUncommittedFiles_thatGoIntoTheCommit', () => {
    expect(uncommittedFileNotes({ total: 2, uncommitted: 2 }).map((note) => [note.messageKey, note.count, note.hasPluralForms])).toEqual([['vsc.notice.uncommittedFiles', 2, true]]);
  });

  it('uncommittedFileNotes_shouldBeEmpty_whenNothingIsUncommittedOrStillLoading', () => {
    expect(uncommittedFileNotes({ total: 2, uncommitted: 0 })).toEqual([]);
    expect(uncommittedFileNotes(undefined)).toEqual([]);
  });

  it('committedFileCount_shouldSubtractUncommittedFromTheBranchDiff', () => {
    expect(committedFileCount({ total: 5, uncommitted: 2 })).toBe(3);
  });
});

describe('findingsTally', () => {
  it('findingsTally_shouldCountReviewRootsByResolution_skippingRepliesOtherScopesAndUnclassified', () => {
    const comments = {
      'a.py': [
        makeComment({ id: 1, scope: 'review', resolution: 'fixed' }),
        makeComment({ id: 2, scope: 'review', resolution: 'fixed', resolved: true }),
        makeComment({ id: 3, scope: 'review', resolution: 'false_positive' }),
        makeComment({ id: 4, scope: 'review', resolution: 'open' }),
        makeComment({ id: 5, scope: 'review', resolution: 'fixed', parent_id: 1 }),
        makeComment({ id: 6, scope: 'plan', resolution: 'fixed' }),
        makeComment({ id: 7, scope: 'review', resolution: null }),
      ],
    };

    expect(findingsTally(comments)).toEqual({ fixed: 2, false_positive: 1, out_of_scope: 0, open: 1 });
  });

  it('presentFindings_shouldListNonZeroResolutionsInSummaryOrder', () => {
    expect(presentFindings({ fixed: 0, false_positive: 2, out_of_scope: 1, open: 3 })).toEqual(['false_positive', 'out_of_scope', 'open']);
  });
});
