// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

const { anchorScrollBlock } = await import('../../webview-ui/src/components/useAnchor');

describe('anchorScrollBlock', () => {
  it('anchorScrollBlock_shouldCenter_whenTargetFitsBelowStickyHeader', () => {
    expect(anchorScrollBlock(300, 800, 120)).toBe('center');
  });

  it('anchorScrollBlock_shouldAlignToStart_whenTargetIsTallerThanSpaceBelowStickyHeader', () => {
    expect(anchorScrollBlock(700, 800, 120)).toBe('start');
  });
});
