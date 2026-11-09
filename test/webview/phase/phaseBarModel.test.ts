import { describe, expect, it } from 'vitest';
import { buildPhaseBar } from '../../../webview-ui/src/tabs/phase/phaseBarModel';

const SEQUENCE = ['0', '1.0', '2.1', '3.1.0', '3.1.1', '3.1.2', '3.1.3', '3.2.0', '3.2.1', '4.0'];
const labelOf = (phase: string): string => `Name ${phase}`;

describe('buildPhaseBar', () => {
  it('buildPhaseBar_shouldCollapseExecutionStepsPerSubPhase_whenSequenceHasStepPhases', () => {
    const segments = buildPhaseBar(SEQUENCE, '0', undefined, labelOf);

    expect(segments.map((segment) => segment.key)).toEqual(['0', '1.0', '2.1', '3.1', '3.2', '4.0']);
    expect(segments[3].phases).toEqual(['3.1.0', '3.1.1', '3.1.2', '3.1.3']);
    expect(segments[3].caption).toBe('3.1');
    expect(segments[3].title).toBe('Name 3.1');
    expect(segments[3].weight).toBeCloseTo(2.4);
  });

  it('buildPhaseBar_shouldMarkDoneCurrentAndUpcoming_whenPhaseIsInsideGroup', () => {
    const segments = buildPhaseBar(SEQUENCE, '3.1.2', undefined, labelOf);

    expect(segments.map((segment) => segment.state)).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'upcoming']);
  });

  it('buildPhaseBar_shouldMarkNothingDone_whenCurrentPhaseIsNotInSequence', () => {
    const segments = buildPhaseBar(SEQUENCE, 'custom', undefined, labelOf);

    expect(segments.every((segment) => segment.state === 'upcoming')).toBe(true);
  });

  it('buildPhaseBar_shouldFlagOnlyPendingGateSegment_whenGatePhaseGiven', () => {
    const segments = buildPhaseBar(SEQUENCE, '3.1.3', '3.1.3', labelOf);

    expect(segments.filter((segment) => segment.isGate).map((segment) => segment.key)).toEqual(['3.1']);
  });

  it('buildPhaseBar_shouldFlagNoGate_whenNoPendingGate', () => {
    expect(buildPhaseBar(SEQUENCE, '2.1', undefined, labelOf).some((segment) => segment.isGate)).toBe(false);
  });

  it('buildPhaseBar_shouldShortenLongCaption_whenLabelExceedsLimit', () => {
    const segments = buildPhaseBar(['1.4'], '1.4', undefined, () => 'A very long phase label');

    expect(segments[0].caption).toBe('A very long…');
    expect(segments[0].title).toBe('A very long phase label');
  });

  it('buildPhaseBar_shouldReturnEmpty_whenSequenceEmpty', () => {
    expect(buildPhaseBar([], '0', undefined, labelOf)).toEqual([]);
  });
});
