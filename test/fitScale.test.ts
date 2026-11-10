import { describe, expect, it } from 'vitest';
import { MIN_READABLE_SCALE, computeFitScale } from '../webview-ui/src/lib/fitScale';

describe('computeFitScale', () => {
  it('computeFitScale_shouldReturnOne_whenContentFitsWidth', () => {
    expect(computeFitScale({ contentWidth: 400, contentHeight: 200, availableWidth: 800 })).toBe(1);
  });

  it('computeFitScale_shouldScaleDownToWidth_whenContentIsWider', () => {
    expect(computeFitScale({ contentWidth: 1000, contentHeight: 200, availableWidth: 800 })).toBe(0.8);
  });

  it('computeFitScale_shouldUseHeightLimit_whenItIsTighter', () => {
    expect(computeFitScale({ contentWidth: 800, contentHeight: 800, availableWidth: 800, maxHeight: 600 })).toBe(0.75);
  });

  it('computeFitScale_shouldKeepReadableScale_whenFitWouldShrinkBelowIt', () => {
    expect(computeFitScale({ contentWidth: 1600, contentHeight: 200, availableWidth: 800 })).toBe(MIN_READABLE_SCALE);
  });

  it('computeFitScale_shouldNotGoBelowFloor_whenContentIsHuge', () => {
    expect(computeFitScale({ contentWidth: 100000, contentHeight: 100, availableWidth: 800 })).toBe(MIN_READABLE_SCALE);
  });

  it('computeFitScale_shouldReturnOne_whenViewportHasNoWidth', () => {
    expect(computeFitScale({ contentWidth: 800, contentHeight: 100, availableWidth: 0 })).toBe(1);
  });
});
