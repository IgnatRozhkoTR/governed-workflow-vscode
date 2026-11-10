import type { JSX } from 'preact';
import { useEffect, useMemo } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { classNames } from '../../components/types';
import { revealChild, useScrollEdges } from '../../shell/layout';
import { usePhaseLabel, useStore } from '../../store/hooks';
import { buildPhaseBar, splitCaption, type PhaseBarSegment } from './phaseBarModel';

export interface PhaseBarProps {
  readonly compact?: boolean;
}

const NO_PHASES: readonly string[] = [];
const CURRENT_SEGMENT_SELECTOR = '[aria-current="step"]';
// Matches the edge fade in phase.css, so the current phase is never left under it.
const EDGE_FADE_PX = 32;

function revealCurrentSegment(bar: HTMLElement): void {
  const segment = bar.querySelector<HTMLElement>(CURRENT_SEGMENT_SELECTOR);
  if (segment !== null) {
    revealChild(bar, segment, EDGE_FADE_PX);
  }
}

// The bar's own width and its content's width are both watched: captions grow once the icon font loads,
// which shifts the current segment without resizing the bar.
function observeLayoutChange(element: HTMLElement, onChange: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') {
    return () => undefined;
  }
  let width = element.clientWidth;
  let contentWidth = element.scrollWidth;
  const observer = new ResizeObserver(() => {
    if (element.clientWidth !== width || element.scrollWidth !== contentWidth) {
      width = element.clientWidth;
      contentWidth = element.scrollWidth;
      onChange();
    }
  });
  observer.observe(element);
  Array.from(element.children).forEach((child) => observer.observe(child));
  return () => observer.disconnect();
}

// A narrow panel scrolls the bar sideways; the current phase is brought into view after layout, and again whenever
// the bar's layout changes, so the user always sees where the ticket is.
function useCurrentSegmentInView(barRef: { readonly current: HTMLElement | null }, currentPhase: string, segmentCount: number): void {
  useEffect(() => {
    const bar = barRef.current;
    if (bar === null) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => revealCurrentSegment(bar));
    const stopObserving = observeLayoutChange(bar, () => revealCurrentSegment(bar));
    return () => {
      cancelAnimationFrame(frame);
      stopObserving();
    };
  }, [currentPhase, segmentCount]);
}

export function PhaseBar({ compact = false }: PhaseBarProps): JSX.Element {
  const sequence = useStore((s) => s.state?.phase_sequence ?? NO_PHASES);
  const currentPhase = useStore((s) => s.state?.phase ?? '');
  const gatePhase = useStore((s) => s.state?.pending_gate?.phase);
  const labelOf = usePhaseLabel();
  const segments = useMemo(() => buildPhaseBar(sequence, currentPhase, gatePhase, labelOf), [sequence, currentPhase, gatePhase, labelOf]);
  const [barRef, edges] = useScrollEdges<HTMLDivElement>();
  useCurrentSegmentInView(barRef, currentPhase, segments.length);
  const edgeClasses = [edges.hasHiddenStart && 'gw-phase-bar-hidden-start', edges.hasHiddenEnd && 'gw-phase-bar-hidden-end'];
  return (
    <div ref={barRef} class={classNames('gw-phase-bar', compact && 'gw-phase-bar-compact', ...edgeClasses)} role="list">
      {segments.map((segment) => (
        <div key={segment.key} class="gw-phase-segment" role="listitem" style={{ flexGrow: segment.weight }} title={segment.title} aria-current={segment.state === 'current' ? 'step' : undefined}>
          <div class={classNames('gw-phase-track', `gw-phase-track-${segment.state}`, segment.isGate && 'gw-phase-track-gate')} />
          {!compact && (
            <PhaseCaption segment={segment} />
          )}
        </div>
      ))}
    </div>
  );
}

function PhaseCaption({ segment }: { readonly segment: PhaseBarSegment }): JSX.Element {
  const { lead, rest } = splitCaption(segment.caption);
  return (
    <div class={classNames('gw-phase-caption', segment.state === 'current' && 'gw-phase-caption-current', segment.isGate && 'gw-phase-caption-gate')}>
      <span class="gw-phase-caption-lead">
        {segment.hasUserGate && <Icon name="lock" className="gw-phase-gate-lock" />}
        {lead}
      </span>
      {rest !== '' && ` ${rest}`}
    </div>
  );
}
