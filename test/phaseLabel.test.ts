import type { Plan } from '@api-types';
import { describe, expect, it } from 'vitest';
import { phaseLabel, registerModuleMessages, setServerMessages } from '../webview-ui/src/i18n/i18n';
import { SHELL_MESSAGES } from '../webview-ui/src/i18n/messages';

const AVAILABLE = [
  { id: '2.0', name: 'Planning' },
  { id: '3.x.0', name: 'Implementation' },
  { id: '3.x.3', name: 'Commit Approval' },
];
const PLAN: Plan = { execution: [{ id: '3.1', name: 'Backend' }] };

describe('phaseLabel', () => {
  it('phaseLabel_shouldUseServerName_whenPhaseIsRegistered', () => {
    expect(phaseLabel('2.0', PLAN, AVAILABLE)).toBe('Planning');
  });

  it('phaseLabel_shouldCombineSubPhaseAndStepNames_withServerTemplate', () => {
    setServerMessages('en', { 'phase.subPhaseName': '{groupName} — {step}' });

    expect(phaseLabel('3.1.3', PLAN, AVAILABLE)).toBe('Backend — Commit Approval');
  });

  it('phaseLabel_shouldFallBackToIds_whenNamesAreMissing', () => {
    setServerMessages('en', { 'phase.subPhaseName': '{groupName} — {step}' });

    expect(phaseLabel('3.2.4', PLAN, AVAILABLE)).toBe('3.2 — 4');
  });

  it('phaseLabel_shouldUseExecutionName_whenPhaseIsSubPhaseGroup', () => {
    expect(phaseLabel('3.1', PLAN, AVAILABLE)).toBe('Backend');
  });

  it('phaseLabel_shouldReturnRawId_whenNothingMatches', () => {
    expect(phaseLabel('9.9', undefined, undefined)).toBe('9.9');
  });

  it('phaseLabel_shouldUseLocalizedServerName_whenPhaseHasNameKey', () => {
    setServerMessages('ru', { 'phase.preplanningReview': 'Обзор предпланирования' });

    expect(phaseLabel('1.4', PLAN, [{ id: '1.4', name: 'Pre-planning Review' }])).toBe('Обзор предпланирования');
  });

  it('phaseLabel_shouldNameFixesStep_whenRegistryOmitsIt', () => {
    setServerMessages('en', { 'phase.subPhaseName': '{groupName} — {step}', 'phase.fixes': 'Fixes' });

    expect(phaseLabel('3.1.2', PLAN, AVAILABLE)).toBe('Backend — Fixes');
  });

  it('phaseLabel_shouldUseCommitApprovalShellKey_whenStepIsThree', () => {
    registerModuleMessages(SHELL_MESSAGES);
    setServerMessages('ru', { 'phase.subPhaseName': '{groupName} — {step}' });

    expect(phaseLabel('3.1.3', PLAN, [])).toBe('Backend — Ревью кода');
  });

  it('phaseLabel_shouldFallBackToRegistryName_whenNameKeyIsMissing', () => {
    setServerMessages('en', {});

    expect(phaseLabel('7.1', undefined, [{ id: '7.1', name: 'Custom Phase' }])).toBe('Custom Phase');
    expect(phaseLabel('1.1', undefined, [{ id: '1.1', name: 'Research' }])).toBe('Research');
  });
});
