// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEW_LANDING, flashNavTarget, nextLanding, type Landing } from '../../webview-ui/src/shell/attentionFlash';

const TARGET = { tab: 'planning', anchor: 'plan-diagram-failed' } as const;

function settle(landing: Landing, top: number, frames: number): { landing: Landing; scrolls: number } {
  let current = landing;
  let scrolls = 0;
  for (let frame = 0; frame < frames; frame++) {
    const step = nextLanding(current, top);
    current = step.landing;
    scrolls += step.shouldScroll ? 1 : 0;
  }
  return { landing: current, scrolls };
}

describe('nextLanding', () => {
  it('nextLanding_shouldWaitForTheTargetToHoldStill_beforeScrolling', () => {
    expect(settle(NEW_LANDING, 100, 6).scrolls).toBe(0);
    expect(settle(NEW_LANDING, 100, 7).scrolls).toBe(1);
  });

  it('nextLanding_shouldScrollAgain_whenTheTargetSettlesSomewhereElse', () => {
    const first = settle(NEW_LANDING, 100, 20);
    const second = settle(first.landing, 2267, 20);

    expect(first.scrolls).toBe(1);
    expect(second.scrolls).toBe(1);
    expect(second.landing.aimedTop).toBe(2267);
  });
});

describe('flashNavTarget', () => {
  let top = 0;
  let target: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'setTimeout'] });
    target = document.createElement('div');
    target.id = TARGET.anchor;
    target.scrollIntoView = vi.fn();
    vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => ({ top, height: 10 }) as DOMRect);
    document.body.appendChild(target);
  });

  afterEach(() => {
    target.remove();
    vi.useRealTimers();
  });

  it('flashNavTarget_shouldLandWhereTheTargetEndsUp_whenContentAboveItGrowsLate', () => {
    top = 100;
    flashNavTarget(TARGET);
    vi.advanceTimersByTime(50);
    top = 2267;
    vi.advanceTimersByTime(500);

    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(target.classList.contains('gw-attention-flash')).toBe(true);
    const callsAfterSettling = vi.mocked(target.scrollIntoView).mock.calls.length;
    vi.advanceTimersByTime(500);
    expect(vi.mocked(target.scrollIntoView).mock.calls.length).toBe(callsAfterSettling);
  });

  it('flashNavTarget_shouldScrollAgain_onARepeatedJumpToTheSameTarget', () => {
    top = 100;
    flashNavTarget(TARGET);
    vi.advanceTimersByTime(500);
    const firstJumpScrolls = vi.mocked(target.scrollIntoView).mock.calls.length;

    flashNavTarget(TARGET);
    vi.advanceTimersByTime(500);

    expect(firstJumpScrolls).toBe(1);
    expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('flashNavTarget_shouldWaitForTheTarget_whenItMountsLate', () => {
    target.remove();
    flashNavTarget(TARGET);
    vi.advanceTimersByTime(300);
    document.body.appendChild(target);
    vi.advanceTimersByTime(500);

    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
