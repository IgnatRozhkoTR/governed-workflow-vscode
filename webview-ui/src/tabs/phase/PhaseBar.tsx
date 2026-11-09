import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { classNames } from '../../components/types';
import { usePhaseLabel, useStore } from '../../store/hooks';
import { buildPhaseBar } from './phaseBarModel';

export interface PhaseBarProps {
  readonly compact?: boolean;
}

const NO_PHASES: readonly string[] = [];

export function PhaseBar({ compact = false }: PhaseBarProps): JSX.Element {
  const sequence = useStore((s) => s.state?.phase_sequence ?? NO_PHASES);
  const currentPhase = useStore((s) => s.state?.phase ?? '');
  const gatePhase = useStore((s) => s.state?.pending_gate?.phase);
  const labelOf = usePhaseLabel();
  const segments = useMemo(() => buildPhaseBar(sequence, currentPhase, gatePhase, labelOf), [sequence, currentPhase, gatePhase, labelOf]);
  return (
    <div class={classNames('gw-phase-bar', compact && 'gw-phase-bar-compact')} role="list">
      {segments.map((segment) => (
        <div key={segment.key} class="gw-phase-segment" role="listitem" style={{ flexGrow: segment.weight }} title={segment.title} aria-current={segment.state === 'current' ? 'step' : undefined}>
          <div class={classNames('gw-phase-track', `gw-phase-track-${segment.state}`, segment.isGate && 'gw-phase-track-gate')} />
          {!compact && (
            <div class={classNames('gw-phase-caption', segment.state === 'current' && 'gw-phase-caption-current', segment.isGate && 'gw-phase-caption-gate')}>
              {segment.caption}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
