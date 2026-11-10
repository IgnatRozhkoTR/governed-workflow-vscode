import type { PhaseTransition } from '@api-types';
import { describe, expect, it } from 'vitest';
import { groupHistory, isBackwardMove, isProminentTransition } from '../../../webview-ui/src/tabs/phase/historyGrouping';

function move(from: string, to: string): PhaseTransition {
  return { from, to, time: '2026-11-01T10:00:00' };
}

describe('isBackwardMove', () => {
  it('isBackwardMove_shouldCompareDottedPhasesNumerically', () => {
    expect(isBackwardMove('3.2.3', '3.1.2')).toBe(true);
    expect(isBackwardMove('1.9', '1.10')).toBe(false);
    expect(isBackwardMove('4.1', '4.1')).toBe(false);
  });
});

describe('isProminentTransition', () => {
  it('isProminentTransition_shouldFlagUserGatesRejectionsAndNotes', () => {
    expect(isProminentTransition(move('1.4', '2.0'), false)).toBe(true);
    expect(isProminentTransition(move('3.1.3', '3.1.4'), false)).toBe(true);
    expect(isProminentTransition(move('4.0', '3.1.2'), false)).toBe(true);
    expect(isProminentTransition(move('2.2', '2.3'), true)).toBe(true);
    expect(isProminentTransition(move('2.2', '2.3'), false)).toBe(false);
  });

  it('isProminentTransition_shouldTreatTheAgentFixLoopAsRoutine_whenFixesReturnToValidation', () => {
    expect(isProminentTransition(move('3.2.2', '3.2.1'), false)).toBe(false);
    expect(isProminentTransition(move('3.2.2', '3.1.1'), false)).toBe(true);
  });
});

describe('groupHistory', () => {
  const history = [move('0', '1.0'), move('1.0', '1.1'), move('1.1', '1.2'), move('1.4', '2.0'), move('2.0', '2.2')];

  it('groupHistory_shouldCollapseConsecutiveRoutineMovesAndKeepGatesNewestFirst', () => {
    const rows = groupHistory(history, new Set());

    expect(rows.map((row) => row.kind)).toEqual(['entry', 'entry', 'run']);
    expect(rows[2].kind === 'run' && rows[2].items.map((item) => item.index)).toEqual([2, 1, 0]);
  });

  it('groupHistory_shouldKeepALoneRoutineMoveAsAnEntry', () => {
    expect(groupHistory([move('1.0', '1.1')], new Set()).map((row) => row.kind)).toEqual(['entry']);
  });

  it('groupHistory_shouldNotCollapseAMoveThatHasRejectionNotes', () => {
    const rows = groupHistory(history, new Set([1]));

    expect(rows.map((row) => row.kind)).toEqual(['entry', 'entry', 'entry', 'entry', 'entry']);
  });
});
