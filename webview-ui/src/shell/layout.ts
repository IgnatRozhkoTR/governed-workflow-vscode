import { useEffect, useRef, useState } from 'preact/hooks';

export type HeaderDensity = 'full' | 'compact' | 'overflow';

export interface ScrollEdges {
  readonly hasHiddenStart: boolean;
  readonly hasHiddenEnd: boolean;
}

const FULL_LABELS_MIN_WIDTH_PX = 1000;
// The header's labels are short, so they stay down to about a 700px panel; icon-only buttons are a last resort.
export const HEADER_LABELS_MIN_WIDTH_PX = 700;
const INLINE_ACTIONS_MIN_WIDTH_PX = 600;
const EDGE_TOLERANCE_PX = 1;
const NO_HIDDEN_EDGES: ScrollEdges = { hasHiddenStart: false, hasHiddenEnd: false };

// Labelled header buttons when there is room, icon-only below that, and an overflow menu on narrow panels.
// A width of 0 means the element has not been laid out yet, so the full header is the safe first render.
export function headerDensity(widthPx: number, fullLabelsMinWidthPx = FULL_LABELS_MIN_WIDTH_PX): HeaderDensity {
  if (widthPx <= 0 || widthPx >= fullLabelsMinWidthPx) {
    return 'full';
  }
  return widthPx >= INLINE_ACTIONS_MIN_WIDTH_PX ? 'compact' : 'overflow';
}

export function phaseChipName(name: string, density: HeaderDensity): string | undefined {
  return density === 'overflow' ? undefined : name;
}

export function scrollEdges(scrollLeft: number, scrollWidth: number, clientWidth: number): ScrollEdges {
  return {
    hasHiddenStart: scrollLeft > EDGE_TOLERANCE_PX,
    hasHiddenEnd: scrollLeft + clientWidth < scrollWidth - EDGE_TOLERANCE_PX,
  };
}

export function observeResize(element: HTMLElement, onResize: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') {
    return () => undefined;
  }
  const observer = new ResizeObserver(onResize);
  observer.observe(element);
  return () => observer.disconnect();
}

// The element's own box does not change when a tab label or badge grows, so its children are observed
// too, and re-observed whenever tabs are added, removed or relabelled.
export function observeContentResize(element: HTMLElement, onResize: () => void): () => void {
  if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') {
    return observeResize(element, onResize);
  }
  const resizeObserver = new ResizeObserver(onResize);
  const observeElementAndChildren = (): void => {
    resizeObserver.disconnect();
    [element, ...Array.from(element.children)].forEach((target) => resizeObserver.observe(target));
  };
  observeElementAndChildren();
  const mutationObserver = new MutationObserver(() => {
    observeElementAndChildren();
    onResize();
  });
  mutationObserver.observe(element, { childList: true, subtree: true, characterData: true });
  return () => {
    resizeObserver.disconnect();
    mutationObserver.disconnect();
  };
}

export function useHeaderDensity<T extends HTMLElement>(fullLabelsMinWidthPx = FULL_LABELS_MIN_WIDTH_PX): [{ readonly current: T | null }, HeaderDensity] {
  const ref = useRef<T>(null);
  const [density, setDensity] = useState<HeaderDensity>('full');
  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }
    const measure = (): void => setDensity(headerDensity(element.clientWidth, fullLabelsMinWidthPx));
    measure();
    return observeResize(element, measure);
  }, []);
  return [ref, density];
}

export function useScrollEdges<T extends HTMLElement>(): [{ readonly current: T | null }, ScrollEdges] {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState<ScrollEdges>(NO_HIDDEN_EDGES);
  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }
    const measure = (): void => {
      const next = scrollEdges(element.scrollLeft, element.scrollWidth, element.clientWidth);
      setEdges((current) => (current.hasHiddenStart === next.hasHiddenStart && current.hasHiddenEnd === next.hasHiddenEnd ? current : next));
    };
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    const stopObserving = observeContentResize(element, measure);
    return () => {
      element.removeEventListener('scroll', measure);
      stopObserving();
    };
  }, []);
  return [ref, edges];
}

// Menu keyboard model (WAI-ARIA menu): arrows wrap around, Home/End jump to the ends. With nothing focused yet,
// ArrowDown starts at the first item and ArrowUp at the last.
export function menuFocusIndex(key: string, current: number, count: number): number | undefined {
  if (count === 0) {
    return undefined;
  }
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowUp':
      return current <= 0 ? count - 1 : current - 1;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return undefined;
  }
}

// The scroll offset that brings [start, end) fully into a viewport of the given width, moving as little as possible.
// The margin keeps the item clear of the edge fades; an item wider than the viewport aligns its start, so its label stays readable.
export function revealScrollLeft(start: number, end: number, scrollLeft: number, clientWidth: number, margin = 0): number {
  const paddedStart = Math.max(0, start - margin);
  const paddedEnd = end + margin;
  if (paddedStart < scrollLeft || paddedEnd - paddedStart > clientWidth) {
    return paddedStart;
  }
  return paddedEnd > scrollLeft + clientWidth ? paddedEnd - clientWidth : scrollLeft;
}

// Measured from the rendered boxes, so the result holds however far the scroller has already moved.
export function revealChild(scroller: HTMLElement, child: HTMLElement, margin: number): void {
  const start = child.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
  const next = revealScrollLeft(start, start + child.offsetWidth, scroller.scrollLeft, scroller.clientWidth, margin);
  if (next !== scroller.scrollLeft) {
    scroller.scrollLeft = next;
  }
}

// How many leading chips fit in one row of the given width, whole and in order; the rest are left for the expanded list.
export function fittingChipCount(chipWidths: readonly number[], availableWidth: number, gap: number): number {
  let usedWidth = 0;
  for (let index = 0; index < chipWidths.length; index++) {
    usedWidth += (index === 0 ? 0 : gap) + chipWidths[index];
    if (usedWidth > availableWidth + EDGE_TOLERANCE_PX) {
      return index;
    }
  }
  return chipWidths.length;
}

export interface DigestLayoutInput {
  // The room left beside the title and the actions, and the width of a row of its own.
  readonly firstRowWidth: number;
  readonly fullRowWidth: number;
  readonly gap: number;
  readonly warningWidths: readonly number[];
  readonly countWidths: readonly number[];
  // The expander alone, carrying "+N more", and carrying just "+N".
  readonly toggleWidth: number;
  readonly moreToggleWidth: number;
  readonly shortMoreToggleWidth: number;
}

// How many chips, warnings first, sit on the actions' row and how many on a second row; the rest go behind "+N more",
// which always follows the last shown chip.
export interface DigestLayout {
  readonly firstRow: number;
  readonly secondRow: number;
  readonly hasSecondRow: boolean;
  readonly isMoreShort: boolean;
  // Only warnings too wide for one line together wrap the second row; otherwise it stays one line.
  readonly isSecondRowWrapped: boolean;
}

interface ChipPlacement {
  readonly layout: DigestLayout;
  // Every warning is shown whole, with the expander beside the last chip.
  readonly isComplete: boolean;
}

// The placement that shows the most chips wins, so a wider bar never shows fewer; on a tie one row beats two and
// "+N more" beats "+N". Warnings never hide: when no placement fits them all beside the expander, they all go on the
// second row, the last one ellipsizing to keep the expander on that line, and wrapping only when they overflow it alone.
export function digestLayout(input: DigestLayoutInput): DigestLayout {
  const complete = [
    placeOnOneRow(input, input.moreToggleWidth, false),
    placeOnOneRow(input, input.shortMoreToggleWidth, true),
    placeOnTwoRows(input, input.moreToggleWidth, false),
    placeOnTwoRows(input, input.shortMoreToggleWidth, true),
  ].filter((candidate) => candidate.isComplete).map((candidate) => candidate.layout);
  if (complete.length === 0) {
    return placeOnTwoRows(input, input.shortMoreToggleWidth, true).layout;
  }
  return complete.reduce((best, candidate) => (shownChipCount(candidate) > shownChipCount(best) ? candidate : best));
}

function shownChipCount(layout: DigestLayout): number {
  return layout.firstRow + layout.secondRow;
}

function digestChipWidths(input: DigestLayoutInput): number[] {
  return [...input.warningWidths, ...input.countWidths];
}

function placeOnOneRow(input: DigestLayoutInput, moreToggleWidth: number, isMoreShort: boolean): ChipPlacement {
  const widths = digestChipWidths(input);
  const firstRow = fitBesideToggle(widths, input.firstRowWidth, { ...input, moreToggleWidth });
  const isComplete = firstRow !== undefined && firstRow >= input.warningWidths.length && (firstRow > 0 || widths.length === 0);
  return { layout: { firstRow: firstRow ?? 0, secondRow: 0, hasSecondRow: false, isMoreShort, isSecondRowWrapped: false }, isComplete };
}

// Every chip moves to the second row, so how many show depends only on the bar's width, never on how much of the
// first row the title takes at a given breakpoint.
function placeOnTwoRows(input: DigestLayoutInput, moreToggleWidth: number, isMoreShort: boolean): ChipPlacement {
  const widths = digestChipWidths(input);
  const fitting = fitBesideToggle(widths, input.fullRowWidth, { ...input, moreToggleWidth }) ?? 0;
  const secondRow = Math.max(fitting, input.warningWidths.length);
  const isSecondRowWrapped = fittingChipCount(widths.slice(0, secondRow), input.fullRowWidth, input.gap) < secondRow;
  return { layout: { firstRow: 0, secondRow, hasSecondRow: true, isMoreShort, isSecondRowWrapped }, isComplete: fitting >= input.warningWidths.length };
}

// What sits behind "+N more": every chip placed on neither row, in order.
export function hiddenDigestItems<T>(ordered: readonly T[], layout: DigestLayout): T[] {
  return ordered.slice(Math.min(ordered.length, layout.firstRow + layout.secondRow));
}

// Undefined when not even the expander fits.
function fitBesideToggle(widths: readonly number[], availableWidth: number, { gap, toggleWidth, moreToggleWidth }: Pick<DigestLayoutInput, 'gap' | 'toggleWidth' | 'moreToggleWidth'>): number | undefined {
  if (fittingChipCount([...widths, toggleWidth], availableWidth, gap) > widths.length) {
    return widths.length;
  }
  return fittingChipCount([moreToggleWidth], availableWidth, gap) === 0
    ? undefined
    : fittingChipCount(widths, availableWidth - moreToggleWidth - gap, gap);
}

// The tabs shown whole in the strip, in order; the rest go behind the "more tabs" menu. The active tab is always
// shown, taking the place of the last tab that fits beside it, so the user always sees where they are.
export function visibleTabIndices(tabWidths: readonly number[], availableWidth: number, moreWidth: number, gap: number, activeIndex: number): number[] {
  const all = tabWidths.map((_, index) => index);
  if (fittingChipCount(tabWidths, availableWidth, gap) === tabWidths.length) {
    return all;
  }
  const roomBesideMore = availableWidth - moreWidth - gap;
  const leading = fittingChipCount(tabWidths, roomBesideMore, gap);
  if (activeIndex < leading || activeIndex < 0 || activeIndex >= tabWidths.length) {
    return all.slice(0, Math.max(leading, 1));
  }
  const besideActive = fittingChipCount(tabWidths.slice(0, activeIndex), roomBesideMore - tabWidths[activeIndex] - gap, gap);
  return [...all.slice(0, besideActive), activeIndex];
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function columnGap(element: HTMLElement): number {
  return pixels(getComputedStyle(element).columnGap);
}

export function contentBoxWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return element.clientWidth - pixels(style.paddingLeft) - pixels(style.paddingRight);
}

export function renderedWidth(element: Element): number {
  return element.getBoundingClientRect().width;
}
