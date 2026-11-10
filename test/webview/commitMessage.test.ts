import { describe, expect, it } from 'vitest';
import { suggestedCommitMessage } from '../../webview-ui/src/shell/commitMessage';

const PLAN = { execution: [{ id: '3.1', name: 'Discount engine (backend)', tasks: [{ title: 'Add rule model' }, { title: ' ' }, { title: 'Apply before tax' }] }, { id: '3.2', name: 'Inventory' }] };

describe('suggestedCommitMessage', () => {
  it('suggestedCommitMessage_shouldUseSubPhaseNameAndTasks_atItsCommitGate', () => {
    expect(suggestedCommitMessage(PLAN, '3.1.3')).toBe('Discount engine (backend)\n\n- Add rule model\n- Apply before tax');
  });

  it('suggestedCommitMessage_shouldUseNameAlone_whenSubPhaseHasNoTasks', () => {
    expect(suggestedCommitMessage(PLAN, '3.2.3')).toBe('Inventory');
  });

  it('suggestedCommitMessage_shouldBeEmpty_whenPlanDoesNotNameTheSubPhaseOrGateIsNotACommit', () => {
    expect(suggestedCommitMessage(PLAN, '3.3.3')).toBe('');
    expect(suggestedCommitMessage(PLAN, '4.2')).toBe('');
    expect(suggestedCommitMessage({}, '3.1.3')).toBe('');
  });
});
