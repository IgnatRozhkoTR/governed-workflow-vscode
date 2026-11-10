import { describe, expect, it } from 'vitest';
import {
  diffCommandConfig,
  effectiveAdvanceMode,
  isPhaseEnabled,
  parsePathLines,
  setPendingAdvanceMode,
  setPendingPhase,
  toggleModule,
  validateAdvanceModes,
  validateRuleDraft,
} from '../../../webview-ui/src/tabs/settings/sections/settingsLogic';

const COMMAND = { claude_command: 'claude', skip_permissions: true, restrict_to_workspace: true, allowed_external_paths: '/tmp/', env_vars: '' };
const RULE = { name: 'my-rule', description: 'desc', paths: ['src/**'], body: '# body' };

describe('validateRuleDraft', () => {
  it('validateRuleDraft_shouldAcceptValidNewRule', () => {
    expect(validateRuleDraft(RULE, true)).toBeUndefined();
  });

  it('validateRuleDraft_shouldRejectInvalidName_whenCreating', () => {
    expect(validateRuleDraft({ ...RULE, name: 'Bad Name' }, true)).toBe('rules.invalidName');
  });

  it('validateRuleDraft_shouldIgnoreName_whenEditing', () => {
    expect(validateRuleDraft({ ...RULE, name: 'Legacy_NAME' }, false)).toBeUndefined();
  });

  it('validateRuleDraft_shouldRequireDescriptionPathsAndBody', () => {
    expect(validateRuleDraft({ ...RULE, description: ' ' }, true)).toBe('rules.description');
    expect(validateRuleDraft({ ...RULE, paths: [] }, true)).toBe('rules.pathsRequired');
    expect(validateRuleDraft({ ...RULE, body: '  ' }, true)).toBe('rules.body');
  });
});

describe('diffCommandConfig', () => {
  it('diffCommandConfig_shouldReturnOnlyChangedFields', () => {
    expect(diffCommandConfig(COMMAND, { ...COMMAND, skip_permissions: false, env_vars: 'A=1' })).toEqual({ skip_permissions: false, env_vars: 'A=1' });
  });

  it('diffCommandConfig_shouldReturnEmpty_whenUnchanged', () => {
    expect(diffCommandConfig(COMMAND, { ...COMMAND })).toEqual({});
  });

  it('diffCommandConfig_shouldTrimCommandAndPaths', () => {
    expect(diffCommandConfig(COMMAND, { ...COMMAND, claude_command: ' claude --x ' })).toEqual({ claude_command: 'claude --x' });
  });
});

describe('phase pending changes', () => {
  it('setPendingPhase_shouldDropEntry_whenValueMatchesSaved', () => {
    expect(setPendingPhase({ a: false }, { a: true }, 'a', false)).toEqual({});
  });

  it('setPendingPhase_shouldTreatMissingSavedAsEnabled', () => {
    expect(setPendingPhase({}, {}, 'a', false)).toEqual({ a: false });
    expect(setPendingPhase({}, { a: false }, 'a', true)).toEqual({});
  });

  it('isPhaseEnabled_shouldForceAlwaysOnAndPreferPending', () => {
    expect(isPhaseEnabled(true, 'a', { a: false }, { a: false })).toBe(true);
    expect(isPhaseEnabled(false, 'a', { a: true }, { a: false })).toBe(false);
    expect(isPhaseEnabled(false, 'b', {}, {})).toBe(true);
  });
});

describe('advance modes', () => {
  it('effectiveAdvanceMode_shouldPreferPendingThenSavedThenNone', () => {
    expect(effectiveAdvanceMode({ '1': 'clear' }, { '1': 'compact' }, '1')).toBe('compact');
    expect(effectiveAdvanceMode({ '1': 'clear' }, {}, '1')).toBe('clear');
    expect(effectiveAdvanceMode({}, {}, '2')).toBe('none');
  });

  it('setPendingAdvanceMode_shouldDropEntry_whenBackToSaved', () => {
    expect(setPendingAdvanceMode({ '1': 'clear' }, { '1': 'none' }, '1', 'clear')).toEqual({});
    expect(setPendingAdvanceMode({}, {}, '1', 'compact')).toEqual({ '1': 'compact' });
  });

  it('validateAdvanceModes_shouldFlagUnknownModesAndBlankKeys', () => {
    expect(validateAdvanceModes({ '1': 'clear' })).toBeUndefined();
    expect(validateAdvanceModes({ '1': 'bogus' })).toBe('1: bogus');
    expect(validateAdvanceModes({ ' ': 'none' })).toBe(' : none');
  });
});

describe('helpers', () => {
  it('parsePathLines_shouldTrimAndDropBlankLines', () => {
    expect(parsePathLines(' a \n\n b\n')).toEqual(['a', 'b']);
  });

  it('toggleModule_shouldAddAndRemoveWithoutDuplicates', () => {
    expect(toggleModule(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleModule(['a', 'b'], 'a', false)).toEqual(['b']);
    expect(toggleModule(['a'], 'a', true)).toEqual(['a']);
  });
});
