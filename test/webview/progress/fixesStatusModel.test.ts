import { describe, expect, it } from 'vitest';
import { findingsToAddress, findingsTone, isFixesPhase, verificationTone } from '../../../webview-ui/src/tabs/progress/fixesStatusModel';

describe('fixes status model', () => {
  it('isFixesPhase_shouldMatchOnlyPhaseFourPointOne', () => {
    expect(isFixesPhase('4.1')).toBe(true);
    expect(isFixesPhase('4.0')).toBe(false);
  });

  it('verificationTone_shouldMapRunStatusesAndTreatNoRunAsNeutral', () => {
    expect(verificationTone('failed')).toBe('danger');
    expect(verificationTone('passed')).toBe('success');
    expect(verificationTone(undefined)).toBe('neutral');
    expect(verificationTone('weird')).toBe('warning');
  });

  it('findingsToAddress_shouldCountOnlyOpenFindings', () => {
    expect(findingsToAddress({ fixed: 3, false_positive: 1, out_of_scope: 2, open: 2 })).toBe(2);
    expect(findingsTone(2)).toBe('warning');
    expect(findingsTone(0)).toBe('success');
  });
});
