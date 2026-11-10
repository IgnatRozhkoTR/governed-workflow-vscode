import type { ProgressEntry } from '@api-types';
import { describe, expect, it } from 'vitest';
import { orderProgressKeys, orderProgressNewestFirst, wasUpdatedAfterCreation } from '../../../webview-ui/src/tabs/progress/progressModel';

const SEQUENCE = ['0', '1.1', '1.4', '2.0', '2.1', '3.1.0', '3.1.1', '3.1.3', '3.2.0', '3.2.1', '4.0', '4.2', '5.1', '6'];

function entry(createdAt: string, updatedAt: string = createdAt): ProgressEntry {
  return { summary: '', created_at: createdAt, updated_at: updatedAt };
}

function progressFor(keys: readonly string[]): Record<string, ProgressEntry> {
  return Object.fromEntries(keys.map((key) => [key, entry('2026-01-01')]));
}

describe('orderProgressKeys', () => {
  it('orderProgressKeys_shouldPlaceSubPhasesBeforeDone_whenSequenceListsOnlyTheirSteps', () => {
    expect(orderProgressKeys(progressFor(['6', '3.2', '3.1', '1.1']), SEQUENCE)).toEqual(['1.1', '3.1', '3.2', '6']);
  });

  it('orderProgressKeys_shouldSortUnknownKeysNumericallyAfterKnownOnes_whenAbsentFromSequence', () => {
    expect(orderProgressKeys(progressFor(['3.10', '1.1', '3.9', 'notes']), SEQUENCE)).toEqual(['1.1', '3.9', '3.10', 'notes']);
  });
});

describe('wasUpdatedAfterCreation', () => {
  it('wasUpdatedAfterCreation_shouldBeFalse_whenTimestampsMatch', () => {
    expect(wasUpdatedAfterCreation(entry('2026-01-01'))).toBe(false);
    expect(wasUpdatedAfterCreation(entry('2026-01-01', '2026-01-02'))).toBe(true);
  });
});

describe('orderProgressNewestFirst', () => {
  it('orderProgressNewestFirst_shouldPutLatestPhaseFirst_whenSequenceIsKnown', () => {
    const entry = { summary: '', details: null, created_at: '', updated_at: '' };
    const progress = { '1.0': entry, '2.0': entry, '4.1': entry };
    expect(orderProgressNewestFirst(progress, ['1.0', '2.0', '4.1'])).toEqual(['4.1', '2.0', '1.0']);
  });
});
