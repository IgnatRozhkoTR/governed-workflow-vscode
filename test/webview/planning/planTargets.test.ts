import { describe, expect, it } from 'vitest';
import { PLAN_TARGET, subPhaseTarget, taskTarget } from '../../../webview-ui/src/tabs/planning/planTargets';

describe('planTargets', () => {
  it('targets_shouldUseStableKeysSharedWithWebPanel', () => {
    expect(PLAN_TARGET).toBe('plan');
    expect(subPhaseTarget('2.1')).toBe('subphase:2.1');
    expect(taskTarget('Build it')).toBe('task:Build it');
  });
});
