import { describe, expect, it } from 'vitest';
import type { Proposal } from '../../../webview-ui/src/api/reflection';
import { summaryPreview } from '../../../webview-ui/src/tabs/progress/progressModel';
import { isFinalPhase } from '@shared/navigation';
import { countProposals, countThreads, splitDuration, ticketDates, ticketSpan } from '../../../webview-ui/src/tabs/progress/summaryModel';
import { makeComment, makeState } from '../../support/fixtures';

function proposal(id: number, status: Proposal['status']): Proposal {
  return {
    id, status, type: 'rule', implementation_kind: 'auto', title: `P${id}`, body: null, payload_json: null,
    reason: null, result_json: null, created_at: '2026-01-01T10:00:00', reviewed_at: null, executed_at: null,
  };
}

describe('isFinalPhase', () => {
  it('isFinalPhase_shouldBeTrue_whenPhaseIsLastInSequence', () => {
    expect(isFinalPhase('6', ['5.1', '6'])).toBe(true);
  });

  it('isFinalPhase_shouldBeFalse_whenPhaseIsNotLastOrSequenceEmpty', () => {
    expect(isFinalPhase('5.1', ['5.1', '6'])).toBe(false);
    expect(isFinalPhase('6', [])).toBe(false);
  });
});

describe('ticketDates', () => {
  it('ticketDates_shouldUseEarliestTimestampAndLastTransitionIntoPhase', () => {
    const state = makeState({
      phase: '6',
      phaseHistory: [
        { from: '0', to: '1.1', time: '2026-01-02T09:00:00' },
        { from: '5.1', to: '6', time: '2026-01-04T10:00:00' },
        { from: '6', to: '5.1', time: '2026-01-04T11:00:00' },
        { from: '5.1', to: '6', time: '2026-01-05T12:00:00' },
      ],
      progress: { '0': { summary: '', created_at: '2026-01-01T08:00:00', updated_at: '2026-01-01T08:00:00' } },
    });
    expect(ticketDates(state)).toEqual({ startedAt: '2026-01-01T08:00:00', finishedAt: '2026-01-05T12:00:00' });
  });

  it('ticketDates_shouldLeaveDatesUndefined_whenNothingWasRecorded', () => {
    expect(ticketDates(makeState())).toEqual({ startedAt: undefined, finishedAt: undefined });
  });
});

describe('countThreads', () => {
  it('countThreads_shouldCountRootCommentsOnly', () => {
    const comments = {
      review: [makeComment({ id: 1, resolved: true }), makeComment({ id: 2, resolved: false }), makeComment({ id: 3, parent_id: 1 })],
      plan: [makeComment({ id: 4, resolved: true })],
    };
    expect(countThreads(comments)).toEqual({ total: 3, resolved: 2 });
  });
});

describe('countProposals', () => {
  it('countProposals_shouldSplitAppliedAndRejected', () => {
    expect(countProposals([proposal(1, 'executed'), proposal(2, 'rejected'), proposal(3, 'proposed'), proposal(4, 'executed')])).toEqual({ applied: 2, rejected: 1 });
  });
});

describe('summaryPreview', () => {
  it('summaryPreview_shouldReturnFirstLineWithoutMarkdown', () => {
    expect(summaryPreview('\n## Added **discount** rules via [service](src/a.py)\n\nMore')).toBe('Added discount rules via service');
  });

  it('summaryPreview_shouldStripListMarkers', () => {
    expect(summaryPreview('- [x] `migrate` done')).toBe('migrate done');
  });

  it('summaryPreview_shouldReturnEmpty_whenSummaryIsBlank', () => {
    expect(summaryPreview('  \n ')).toBe('');
  });
});

describe('ticketSpan', () => {
  it('ticketSpan_shouldHideFinished_whenBothDatesFormatIdentically', () => {
    expect(ticketSpan({ startedAt: '2026-01-01T10:00:05', finishedAt: '2026-01-01T10:00:40' })).toEqual({ showFinished: false });
  });

  it('ticketSpan_shouldReturnDuration_whenDatesDiffer', () => {
    const span = ticketSpan({ startedAt: '2026-01-01T10:00:00', finishedAt: '2026-01-01T12:30:00' });
    expect(span).toEqual({ showFinished: true, durationMs: 9_000_000 });
  });

  it('ticketSpan_shouldHideFinished_whenFinishUnknown', () => {
    expect(ticketSpan({ startedAt: '2026-01-01T10:00:00' })).toEqual({ showFinished: false });
  });
});

describe('splitDuration', () => {
  it('splitDuration_shouldSplitIntoDaysHoursMinutes', () => {
    expect(splitDuration(((26 * 60) + 5) * 60_000)).toEqual({ days: 1, hours: 2, minutes: 5 });
  });

  it('splitDuration_shouldRoundUpToOneMinute_whenShorter', () => {
    expect(splitDuration(1000)).toEqual({ days: 0, hours: 0, minutes: 1 });
  });
});
