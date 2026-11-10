import { describe, expect, it } from 'vitest';
import type { PipelineFileResult, ReviewPipelineStatus } from '../../../webview-ui/src/api/phaseControl';
import { canStartPipeline, elapsedSeconds, filesProgress, isBeforeReviewStart, isPipelineActive } from '../../../webview-ui/src/tabs/phase/pipelineModel';

function statusIn(state: ReviewPipelineStatus['state']): ReviewPipelineStatus {
  return { state } as ReviewPipelineStatus;
}

function file(status: PipelineFileResult['status']): PipelineFileResult {
  return { file: 'a.ts', status, findings_count: 0, error: null };
}

describe('pipelineModel', () => {
  it('isPipelineActive_shouldBeTrue_whenStateIsInFlight', () => {
    expect(isPipelineActive(statusIn('file_stage'))).toBe(true);
    expect(isPipelineActive(statusIn('queued'))).toBe(true);
  });

  it('isPipelineActive_shouldBeFalse_whenTerminalOrAbsent', () => {
    expect(isPipelineActive(statusIn('done'))).toBe(false);
    expect(isPipelineActive(statusIn('failed'))).toBe(false);
    expect(isPipelineActive(undefined)).toBe(false);
  });

  it('canStartPipeline_shouldAllowStart_whenNoRunOrTerminal', () => {
    expect(canStartPipeline(undefined)).toBe(true);
    expect(canStartPipeline(statusIn('done'))).toBe(true);
    expect(canStartPipeline(statusIn('failed'))).toBe(true);
    expect(canStartPipeline(statusIn('adjudication_stage'))).toBe(false);
  });

  it('elapsedSeconds_shouldUseNow_whenNotFinished', () => {
    expect(elapsedSeconds(100, null, 142.4)).toBe(42);
  });

  it('elapsedSeconds_shouldUseFinishTime_whenFinished', () => {
    expect(elapsedSeconds(100, 130, 999)).toBe(30);
  });

  it('elapsedSeconds_shouldBeUndefined_whenNotStarted', () => {
    expect(elapsedSeconds(null, null, 10)).toBeUndefined();
  });

  it('filesProgress_shouldCountDoneAndFailedAsReviewed_whenMixedStatuses', () => {
    const files = { a: file('done'), b: file('failed'), c: file('running'), d: file('pending') };

    expect(filesProgress(files)).toEqual({ done: 2, total: 4 });
  });
});

describe('isBeforeReviewStart', () => {
  const SEQUENCE = ['2.0', '3.1.0', '4.0', '4.1', '4.2'];

  it('isBeforeReviewStart_shouldBeTrue_whenPhaseComesBeforeReviewStart', () => {
    expect(isBeforeReviewStart(SEQUENCE, '3.1.0')).toBe(true);
  });

  it('isBeforeReviewStart_shouldBeFalse_whenPhaseIsAtOrPastReviewStart', () => {
    expect(isBeforeReviewStart(SEQUENCE, '4.0')).toBe(false);
    expect(isBeforeReviewStart(SEQUENCE, '4.2')).toBe(false);
  });

  it('isBeforeReviewStart_shouldBeFalse_whenEitherPhaseIsMissingFromSequence', () => {
    expect(isBeforeReviewStart(SEQUENCE, '9.9')).toBe(false);
    expect(isBeforeReviewStart(['2.0', '3.1.0'], '2.0')).toBe(false);
  });
});
