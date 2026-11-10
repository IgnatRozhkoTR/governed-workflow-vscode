// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Popover } from '../../webview-ui/src/components/Popover';

afterEach(cleanup);

function renderInsideClickableRow(onClose: () => void, anchor = document.createElement('button')): { readonly onRowClick: ReturnType<typeof vi.fn>; readonly onRowKey: ReturnType<typeof vi.fn> } {
  const onRowClick = vi.fn();
  const onRowKey = vi.fn();
  document.body.appendChild(anchor);
  render(
    <div role="treeitem" tabIndex={0} onClick={onRowClick} onKeyDown={onRowKey} onMouseDown={onRowClick}>
      <Popover open anchor={anchor} onClose={onClose}>
        <button type="button">inside</button>
      </Popover>
    </div>,
  );
  return { onRowClick, onRowKey };
}

describe('Popover', () => {
  it('click_shouldNotReachRow_whenClickHappensInsidePopover', () => {
    const onClose = vi.fn();
    const { onRowClick } = renderInsideClickableRow(onClose);
    const inside = screen.getByText('inside');
    fireEvent.mouseDown(inside);
    fireEvent.click(inside);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keyDown_shouldNotReachRow_whenEnterIsPressedInsidePopover', () => {
    const { onRowKey } = renderInsideClickableRow(vi.fn());
    fireEvent.keyDown(screen.getByText('inside'), { key: 'Enter' });
    expect(onRowKey).not.toHaveBeenCalled();
  });

  it('onClose_shouldBeCalled_whenMouseDownHappensOutside', () => {
    const onClose = vi.fn();
    renderInsideClickableRow(onClose);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('onClose_shouldBeCalled_whenEscapeIsPressedInsidePopover', () => {
    const onClose = vi.fn();
    renderInsideClickableRow(onClose);
    fireEvent.keyDown(screen.getByText('inside'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('escape_shouldReturnFocusToAnchor', () => {
    const anchor = document.createElement('button');
    renderInsideClickableRow(vi.fn(), anchor);
    screen.getByText('inside').focus();

    fireEvent.keyDown(screen.getByText('inside'), { key: 'Escape' });

    expect(document.activeElement).toBe(anchor);
  });
});

describe('Popover placement', () => {
  const VIEWPORT = { width: 420, height: 400 };

  function box(top: number, left: number, width: number, height: number): DOMRect {
    return { top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) } as DOMRect;
  }

  function renderAt(anchorBox: DOMRect, popoverSize: { width: number; height: number }): HTMLElement {
    return renderTracking(() => anchorBox, popoverSize);
  }

  function renderTracking(anchorBox: () => DOMRect, popoverSize: { width: number; height: number }): HTMLElement {
    vi.stubGlobal('innerWidth', VIEWPORT.width);
    vi.stubGlobal('innerHeight', VIEWPORT.height);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('gw-popover') ? box(0, 0, popoverSize.width, popoverSize.height) : anchorBox();
    });
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    render(<Popover open anchor={anchor} onClose={vi.fn()}><span>body</span></Popover>);
    return document.querySelector('.gw-popover') as HTMLElement;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('position_shouldOpenBelowAnchor_whenThereIsRoom', () => {
    const popover = renderAt(box(50, 20, 20, 20), { width: 200, height: 100 });

    expect(popover.style.top).toBe('74px');
    expect(popover.style.left).toBe('20px');
  });

  it('position_shouldFlipAboveAnchor_whenNoRoomBelow', () => {
    const popover = renderAt(box(300, 20, 20, 20), { width: 200, height: 150 });

    expect(popover.style.top).toBe('146px');
  });

  it('position_shouldClampIntoViewport_whenNeitherSideFits', () => {
    const popover = renderAt(box(150, 380, 20, 20), { width: 300, height: 300 });

    expect(popover.style.top).toBe('92px');
    expect(popover.style.left).toBe('112px');
  });

  it('position_shouldFollowAnchor_whenAnyContainerScrolls', () => {
    let anchorTop = 50;
    const scroller = document.createElement('div');
    document.body.appendChild(scroller);
    const popover = renderTracking(() => box(anchorTop, 20, 20, 20), { width: 200, height: 100 });

    anchorTop = 10;
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });

    expect(popover.style.top).toBe('34px');
  });

  it('unmount_shouldRemoveScrollListener', () => {
    const removeListener = vi.spyOn(document, 'removeEventListener');
    renderAt(box(50, 20, 20, 20), { width: 200, height: 100 });

    cleanup();

    expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function), expect.objectContaining({ capture: true }));
  });
});
