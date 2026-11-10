// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceState } from '../../src/api/types';
import { rpc } from '../../webview-ui/src/rpc/rpcClient';
import { Header } from '../../webview-ui/src/shell/Header';
import { HEADER_LABELS_MIN_WIDTH_PX, digestLayout, type DigestLayout, type DigestLayoutInput, fittingChipCount, hiddenDigestItems, headerDensity, menuFocusIndex, revealScrollLeft, scrollEdges, visibleTabIndices } from '../../webview-ui/src/shell/layout';
import { TabBar, rovingTabIndex } from '../../webview-ui/src/shell/TabBar';
import { store } from '../../webview-ui/src/store/store';
import type { TabModule } from '../../webview-ui/src/tabs/types';
import { makeState } from '../support/fixtures';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

vi.mock('../../webview-ui/src/api/core', () => ({
  getAvailablePhases: vi.fn(() => new Promise(() => undefined)),
  setYolo: vi.fn(),
  setLocale: vi.fn(),
  notifyClaude: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function module(id: TabModule['id']): TabModule {
  return { id, titleKey: `tabs.${id}`, icon: 'circle', Component: () => null };
}

function showWorkspace(overrides: Partial<WorkspaceState>): void {
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'p', branch: 'b' }, state: makeState(overrides), etag: null } });
}

describe('rovingTabIndex', () => {
  it('rovingTabIndex_shouldWrapArrowsAndJumpHomeEnd', () => {
    expect(rovingTabIndex('ArrowRight', 2, 3)).toBe(0);
    expect(rovingTabIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(rovingTabIndex('Home', 1, 3)).toBe(0);
    expect(rovingTabIndex('End', 0, 3)).toBe(2);
    expect(rovingTabIndex('a', 0, 3)).toBeUndefined();
  });
});

describe('TabBar', () => {
  const MODULES = [module('planning'), module('phase'), module('settings')];

  it('render_shouldMakeOnlyActiveTabTabbable', () => {
    render(<TabBar modules={MODULES} activeId="phase" onSelect={vi.fn()} />);

    expect(screen.getAllByRole('tab').map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true');
  });

  it('render_shouldListTabsThatDoNotFitInMoreMenu_whenStripIsNarrow', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(150);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100 } as DOMRect);
    const onSelect = vi.fn();
    render(<TabBar modules={MODULES} activeId="planning" onSelect={onSelect} />);

    expect(screen.getAllByRole('tab').map((tab) => tab.id)).toEqual(['gw-tab-planning']);
    fireEvent.click(screen.getByLabelText('vsc.tabs.more'));
    fireEvent.click(screen.getAllByRole('menuitem')[1]);
    expect(onSelect).toHaveBeenCalledWith('settings');
  });

  it('render_shouldShowNoMoreMenu_whenAllTabsFit', () => {
    render(<TabBar modules={MODULES} activeId="planning" onSelect={vi.fn()} />);

    expect(screen.queryByLabelText('vsc.tabs.more')).toBeNull();
  });

  it('keyDown_shouldSelectNeighbourTab_whenArrowOrHomeEndPressed', () => {
    const onSelect = vi.fn();
    render(<TabBar modules={MODULES} activeId="phase" onSelect={onSelect} />);
    const active = screen.getAllByRole('tab')[1];

    fireEvent.keyDown(active, { key: 'ArrowRight' });
    fireEvent.keyDown(active, { key: 'ArrowLeft' });
    fireEvent.keyDown(active, { key: 'End' });
    fireEvent.keyDown(active, { key: 'Home' });

    expect(onSelect.mock.calls.map(([id]) => id)).toEqual(['settings', 'planning', 'settings', 'planning']);
  });
});

describe('Header', () => {
  it('phaseChip_shouldBecomeGateIndicatorAndNavigateToPreplanningApproval_whenGateIs14', () => {
    showWorkspace({ phase: '1.4', pending_gate: { phase: '1.4', accepts_commit_message: false } });
    render(<Header />);

    fireEvent.click(document.querySelector('.gw-header-phase-chip-waiting') as HTMLButtonElement);

    expect(store.getSnapshot().nav).toMatchObject({ tab: 'preplanning', anchor: 'preplanning-approval' });
  });

  it('phaseChip_shouldShowPhaseOnlyWithADot_whenGateWaits', () => {
    showWorkspace({ phase: '4.2', pending_gate: { phase: '4.2', accepts_commit_message: false } });
    render(<Header />);

    const chip = document.querySelector('.gw-header-phase-chip-waiting') as HTMLButtonElement;
    expect(chip.querySelector('.gw-header-phase-dot')).not.toBeNull();
    expect(chip.querySelector('.codicon-bell')).toBeNull();
    expect(chip.querySelector('.gw-phase-id')?.textContent).toBe('4.2');
  });

  it('phaseChip_shouldNavigateToShipSummaryAndRememberTab_whenGateIs42', () => {
    const call = vi.spyOn(rpc, 'call').mockResolvedValue(undefined as never);
    showWorkspace({ phase: '4.2', pending_gate: { phase: '4.2', accepts_commit_message: false } });
    render(<Header />);

    fireEvent.click(document.querySelector('.gw-header-phase-chip-waiting') as HTMLButtonElement);

    expect(store.getSnapshot().nav).toMatchObject({ tab: 'progress', anchor: 'ship-summary' });
    expect(call).toHaveBeenCalledWith('panel.rememberTab', { tab: 'progress' });
  });

  it('phaseChip_shouldMarkCurrentPhaseAndOpenTheGate_whenGateDiffersFromCurrentPhase', () => {
    showWorkspace({ phase: '4.1', pending_gate: { phase: '4.2', accepts_commit_message: false } });
    render(<Header />);

    fireEvent.click(document.querySelector('.gw-header-phase-chip-waiting') as HTMLButtonElement);

    expect(document.querySelector('.gw-phase-id')?.textContent).toBe('4.1');
    expect(store.getSnapshot().nav).toMatchObject({ tab: 'progress', anchor: 'ship-summary' });
  });

  it('phaseChip_shouldHaveNoDot_whenNothingWaits', () => {
    showWorkspace({ phase: '3.2.3', plan: { description: 'Plan' }, plan_status: 'approved' });
    render(<Header />);

    expect(document.querySelector('.gw-header-phase-dot')).toBeNull();
  });

  it('phaseChip_shouldShowDot_whilePlanAwaitsDecision', () => {
    showWorkspace({ phase: '2.0', plan: { description: 'Plan' }, plan_status: 'pending' });
    render(<Header />);

    expect(document.querySelector('.gw-header-phase-dot')).not.toBeNull();
  });

  it('localeSelect_shouldHaveAccessibleName', () => {
    showWorkspace({});
    render(<Header />);

    expect(screen.getByRole('combobox').getAttribute('aria-label')).toBe('vsc.header.language');
  });

  it('actions_shouldCollapseIntoOverflowMenu_whenHeaderIsNarrow', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(420);
    showWorkspace({});
    render(<Header />);

    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByTitle('vsc.header.moreActions'));

    expect(screen.getByRole('menu').textContent).toContain('buttons.resume');
    expect(screen.getAllByRole('menuitemradio').map((item) => item.getAttribute('aria-checked'))).toEqual(['true', 'false']);
  });

  it('overflowMenu_shouldStayBusy_whenNotifyIsStillRunningAfterMenuCloses', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(420);
    showWorkspace({});
    render(<Header />);
    fireEvent.click(screen.getByTitle('vsc.header.moreActions'));

    fireEvent.click(screen.getAllByRole('menuitem')[0]);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByTitle('vsc.header.moreActions').getAttribute('aria-busy')).toBe('true');
  });

  it('overflowMenu_shouldFocusFirstItemAndMoveWithArrowsHomeEnd', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(420);
    showWorkspace({});
    render(<Header />);
    fireEvent.click(screen.getByTitle('vsc.header.moreActions'));
    const menu = screen.getByRole('menu');
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role^="menuitem"]'));

    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('overflowMenu_shouldReturnFocusToTrigger_whenEscapeClosesIt', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(420);
    showWorkspace({});
    render(<Header />);
    const trigger = screen.getByTitle('vsc.header.moreActions');
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('actions_shouldHideNotifyAndResume_whenTicketIsFinished', () => {
    showWorkspace({ phase: '6', phase_sequence: ['5.1', '6'] });
    render(<Header />);

    expect(screen.queryByTitle('buttons.resume')).toBeNull();
    expect(screen.queryByTitle('actions.notify')).toBeNull();
    expect(screen.getByTitle('header.switch')).toBeTruthy();
  });

  it('overflowMenu_shouldHideNotifyAndResume_whenTicketIsFinished', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(420);
    showWorkspace({ phase: '6', phase_sequence: ['5.1', '6'] });
    render(<Header />);
    fireEvent.click(screen.getByTitle('vsc.header.moreActions'));

    expect(screen.getByRole('menu').textContent).not.toContain('buttons.resume');
    expect(screen.getByRole('menu').textContent).not.toContain('actions.notify');
  });

  it('needsAttention_shouldJumpToTicketSummaryAndRememberTab_whenTicketIsFinished', () => {
    const call = vi.spyOn(rpc, 'call').mockReturnValue(new Promise(() => undefined) as never);
    showWorkspace({ phase: '6', phase_sequence: ['5.1', '6'] });
    render(<Header />);

    fireEvent.click(screen.getByText('vsc.attention.label').closest('button') as HTMLButtonElement);

    expect(store.getSnapshot().nav).toMatchObject({ tab: 'progress', anchor: 'progress-summary' });
    expect(call).toHaveBeenCalledWith('panel.rememberTab', { tab: 'progress' });
  });

  it('needsAttention_shouldBeHidden_whenNothingWaits', () => {
    showWorkspace({ phase: '3.1', phase_sequence: ['3.1', '6'] });
    render(<Header />);

    expect(screen.queryByText('vsc.attention.label')).toBeNull();
  });

  it('actions_shouldDropButtonLabels_whenHeaderIsMediumWidth', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(650);
    showWorkspace({});
    render(<Header />);

    expect(screen.getByTitle('buttons.resume').textContent).toBe('');
    expect(screen.getByRole('combobox')).toBeTruthy();
  });
});

describe('headerDensity', () => {
  it('headerDensity_shouldStepFromFullToCompactToOverflow_asWidthShrinks', () => {
    expect(headerDensity(1280)).toBe('full');
    expect(headerDensity(800)).toBe('compact');
    expect(headerDensity(800, HEADER_LABELS_MIN_WIDTH_PX)).toBe('full');
    expect(headerDensity(650, HEADER_LABELS_MIN_WIDTH_PX)).toBe('compact');
    expect(headerDensity(420)).toBe('overflow');
    expect(headerDensity(360)).toBe('overflow');
  });

  it('headerDensity_shouldRenderFull_whenNotLaidOutYet', () => {
    expect(headerDensity(0)).toBe('full');
  });
});

describe('scrollEdges', () => {
  it('scrollEdges_shouldReportHiddenTabsOnEachSide', () => {
    expect(scrollEdges(0, 1321, 1240)).toEqual({ hasHiddenStart: false, hasHiddenEnd: true });
    expect(scrollEdges(81, 1321, 1240)).toEqual({ hasHiddenStart: true, hasHiddenEnd: false });
    expect(scrollEdges(40, 1321, 1240)).toEqual({ hasHiddenStart: true, hasHiddenEnd: true });
    expect(scrollEdges(0, 900, 900)).toEqual({ hasHiddenStart: false, hasHiddenEnd: false });
  });
});

describe('menuFocusIndex', () => {
  it('menuFocusIndex_shouldWrapArrowsJumpHomeEnd_andStartFromEdgesWhenNothingFocused', () => {
    expect(menuFocusIndex('ArrowDown', -1, 4)).toBe(0);
    expect(menuFocusIndex('ArrowUp', -1, 4)).toBe(3);
    expect(menuFocusIndex('ArrowDown', 3, 4)).toBe(0);
    expect(menuFocusIndex('ArrowUp', 0, 4)).toBe(3);
    expect(menuFocusIndex('Home', 2, 4)).toBe(0);
    expect(menuFocusIndex('End', 0, 4)).toBe(3);
    expect(menuFocusIndex('Enter', 0, 4)).toBeUndefined();
    expect(menuFocusIndex('ArrowDown', -1, 0)).toBeUndefined();
  });
});

describe('revealScrollLeft', () => {
  it('revealScrollLeft_shouldScrollMinimally_toBringTabIntoView', () => {
    expect(revealScrollLeft(100, 200, 0, 400)).toBe(0);
    expect(revealScrollLeft(500, 620, 0, 400)).toBe(220);
    expect(revealScrollLeft(40, 140, 300, 400)).toBe(40);
  });

  it('revealScrollLeft_shouldAlignStart_whenTabIsWiderThanViewport', () => {
    expect(revealScrollLeft(500, 1000, 0, 300)).toBe(500);
  });

  it('revealScrollLeft_shouldKeepItemClearOfTheFades_whenMarginIsGiven', () => {
    expect(revealScrollLeft(500, 620, 0, 400, 32)).toBe(252);
    expect(revealScrollLeft(100, 200, 90, 400, 32)).toBe(68);
    expect(revealScrollLeft(10, 60, 50, 400, 32)).toBe(0);
  });
});

describe('fittingChipCount', () => {
  it('fittingChipCount_shouldFitEveryChip_whenRowHasRoom', () => {
    expect(fittingChipCount([80, 150, 140], 400, 6)).toBe(3);
  });

  it('fittingChipCount_shouldCountGapsBetweenChipsOnly', () => {
    expect(fittingChipCount([100, 100], 206, 6)).toBe(2);
    expect(fittingChipCount([100, 100], 204, 6)).toBe(1);
  });

  it('fittingChipCount_shouldStopAtTheFirstChipThatDoesNotFit_keepingOrder', () => {
    expect(fittingChipCount([80, 300, 40], 200, 6)).toBe(1);
  });

  it('fittingChipCount_shouldFitNothing_whenFirstChipIsTooWideOrRowIsEmpty', () => {
    expect(fittingChipCount([250], 200, 6)).toBe(0);
    expect(fittingChipCount([80], 0, 6)).toBe(0);
    expect(fittingChipCount([], 200, 6)).toBe(0);
  });
});

describe('hiddenDigestItems', () => {
  it('hiddenDigestItems_shouldReturnOnlyChipsOnNeitherRow_whenSomeDoNotFit', () => {
    const layout = { firstRow: 1, secondRow: 1, hasSecondRow: true, isMoreShort: false, isSecondRowWrapped: false };

    expect(hiddenDigestItems(['a', 'b', 'c', 'd'], layout)).toEqual(['c', 'd']);
  });

  it('hiddenDigestItems_shouldReturnNothing_whenEveryChipFitsOnTheFirstRow', () => {
    const layout = { firstRow: Number.POSITIVE_INFINITY, secondRow: 0, hasSecondRow: false, isMoreShort: false, isSecondRowWrapped: false };

    expect(hiddenDigestItems(['a', 'b'], layout)).toEqual([]);
  });
});

describe('digestLayout', () => {
  const input = { firstRowWidth: 300, fullRowWidth: 300, gap: 6, warningWidths: [], countWidths: [], toggleWidth: 20, moreToggleWidth: 60, shortMoreToggleWidth: 30 };

  function shownChips(layout: DigestLayout): number {
    return layout.firstRow + layout.secondRow;
  }

  it('digestLayout_shouldKeepOneRow_whenEveryChipAndTheToggleFitBesideTheActions', () => {
    expect(digestLayout({ ...input, firstRowWidth: 400, warningWidths: [100], countWidths: [80] }))
      .toEqual({ firstRow: 2, secondRow: 0, hasSecondRow: false, isMoreShort: false, isSecondRowWrapped: false });
  });

  it('digestLayout_shouldKeepOneRow_whenASecondRowWouldShowNoMoreChips', () => {
    expect(digestLayout({ ...input, firstRowWidth: 250, fullRowWidth: 250, countWidths: [100, 300] }))
      .toEqual({ firstRow: 1, secondRow: 0, hasSecondRow: false, isMoreShort: false, isSecondRowWrapped: false });
  });

  it('digestLayout_shouldMoveEveryChipToSecondRow_whenThatShowsMoreChipsThanOneRow', () => {
    expect(digestLayout({ ...input, firstRowWidth: 250, fullRowWidth: 400, warningWidths: [100], countWidths: [100, 100] }))
      .toEqual({ firstRow: 0, secondRow: 3, hasSecondRow: true, isMoreShort: false, isSecondRowWrapped: false });
  });

  it('digestLayout_shouldMoveChipsToSecondRow_whenNoChipFitsBesideTheActions', () => {
    expect(digestLayout({ ...input, firstRowWidth: 70, countWidths: [100, 100] }))
      .toEqual({ firstRow: 0, secondRow: 2, hasSecondRow: true, isMoreShort: false, isSecondRowWrapped: false });
  });

  it('digestLayout_shouldShortenMore_whenThatKeepsEveryWarningOnTwoRows', () => {
    expect(digestLayout({ ...input, firstRowWidth: 120, fullRowWidth: 520, warningWidths: [150, 150, 150], countWidths: [80], moreToggleWidth: 70 }))
      .toEqual({ firstRow: 0, secondRow: 3, hasSecondRow: true, isMoreShort: true, isSecondRowWrapped: false });
  });

  it('digestLayout_shouldWrapEveryWarning_whenEvenShortMoreLeavesOneOut', () => {
    expect(digestLayout({ ...input, firstRowWidth: 120, fullRowWidth: 400, warningWidths: [150, 150, 150], countWidths: [80], moreToggleWidth: 70 }))
      .toEqual({ firstRow: 0, secondRow: 3, hasSecondRow: true, isMoreShort: true, isSecondRowWrapped: true });
  });

  it('digestLayout_shouldKeepTheSecondRowOneLine_whenOnlyTheToggleOverflowsIt', () => {
    expect(digestLayout({ ...input, firstRowWidth: 120, fullRowWidth: 400, warningWidths: [220, 150], countWidths: [80] }))
      .toEqual({ firstRow: 0, secondRow: 2, hasSecondRow: true, isMoreShort: true, isSecondRowWrapped: false });
  });

  it('digestLayout_shouldKeepTheToggleAfterTheWarnings_whenTheWarningsFillTheSecondRow', () => {
    expect(digestLayout({ ...input, firstRowWidth: 120, fullRowWidth: 400, warningWidths: [380], countWidths: [100, 100], moreToggleWidth: 70 }))
      .toEqual({ firstRow: 0, secondRow: 1, hasSecondRow: true, isMoreShort: true, isSecondRowWrapped: false });
  });

  // Bars as the panel draws them: the column stops at 1250px, the title hides below 600px and shows its full name from 1000px.
  const bars = {
    review: { warningWidths: [380], countWidths: [210, 140], actions: 310 },
    commitReady: { warningWidths: [], countWidths: [290, 250, 150], actions: 330 },
    multi: { warningWidths: [210, 150], countWidths: [240, 140], actions: 260 },
    preplanning: { warningWidths: [260, 230], countWidths: [180, 150, 120], actions: 300 },
    plan: { warningWidths: [], countWidths: [200, 170, 110], actions: 280 },
    final: { warningWidths: [120], countWidths: [110, 230, 170, 160, 190], actions: 250 },
  };
  const widths = Array.from({ length: 1601 }, (_, index) => 400 + index);

  function barAt(bar: (typeof bars)[keyof typeof bars], width: number): DigestLayoutInput {
    const fullRowWidth = Math.min(width, 1250) - 30;
    const titleWidth = width < 600 ? 0 : Math.min(width >= 1000 ? 390 : 60, fullRowWidth * 0.4);
    const firstRowWidth = Math.max(0, fullRowWidth - titleWidth - bar.actions - 24);
    return { ...input, firstRowWidth, fullRowWidth, warningWidths: bar.warningWidths, countWidths: bar.countWidths, moreToggleWidth: 70 };
  }

  it.each(Object.entries(bars))('digestLayout_shouldNeverShowFewerChips_whenThe%sBarWidens', (_, bar) => {
    const counts = widths.map((width) => shownChips(digestLayout(barAt(bar, width))));

    counts.slice(1).forEach((count, index) => expect(count, `at ${widths[index + 1]}px`).toBeGreaterThanOrEqual(counts[index]));
  });

  it('digestLayout_shouldNeverShowFewerChips_whenEitherRowWidens', () => {
    const bar = { ...input, warningWidths: [150, 90], countWidths: [120, 200, 80, 160], moreToggleWidth: 70 };
    const shownAt = (firstRowWidth: number, fullRowWidth: number): number => shownChips(digestLayout({ ...bar, firstRowWidth, fullRowWidth }));
    for (let fullRowWidth = 400; fullRowWidth <= 2000; fullRowWidth += 10) {
      for (let firstRowWidth = 0; firstRowWidth <= fullRowWidth; firstRowWidth += 10) {
        const shown = shownAt(firstRowWidth, fullRowWidth);
        expect(shownAt(firstRowWidth + 10, fullRowWidth + 10), `beside ${firstRowWidth}px of ${fullRowWidth}px`).toBeGreaterThanOrEqual(shown);
        expect(shownAt(firstRowWidth, fullRowWidth + 10), `beside ${firstRowWidth}px of ${fullRowWidth}px`).toBeGreaterThanOrEqual(shown);
      }
    }
  });
});

describe('visibleTabIndices', () => {
  const WIDTHS = [100, 100, 100, 100, 100];

  it('visibleTabIndices_shouldShowEveryTab_whenAllFit', () => {
    expect(visibleTabIndices(WIDTHS, 500, 30, 0, 4)).toEqual([0, 1, 2, 3, 4]);
  });

  it('visibleTabIndices_shouldKeepLeadingWholeTabsBesideMore_whenActiveFits', () => {
    expect(visibleTabIndices(WIDTHS, 350, 30, 0, 1)).toEqual([0, 1, 2]);
  });

  it('visibleTabIndices_shouldSwapActiveTabIn_whenItWouldBeHidden', () => {
    expect(visibleTabIndices(WIDTHS, 350, 30, 0, 4)).toEqual([0, 1, 4]);
  });

  it('visibleTabIndices_shouldShowActiveAlone_whenNothingElseFits', () => {
    expect(visibleTabIndices(WIDTHS, 120, 30, 0, 3)).toEqual([3]);
    expect(visibleTabIndices(WIDTHS, 120, 30, 0, -1)).toEqual([0]);
  });
});
