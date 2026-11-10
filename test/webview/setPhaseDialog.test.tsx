// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '../../webview-ui/src/api/core';
import { SetPhaseDialog, canSubmitPhase, selectablePhases } from '../../webview-ui/src/components/SetPhaseDialog';
import { store } from '../../webview-ui/src/store/store';
import { makeState } from '../support/fixtures';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

vi.mock('../../webview-ui/src/api/core', () => ({
  getAvailablePhases: vi.fn(() => new Promise(() => undefined)),
  setPhase: vi.fn(),
}));

const SEQUENCE = ['1.1', '2.0', '2.1'];
const CUSTOM_PHASE = '__custom__';

function showWorkspace(phase: string): void {
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'p', branch: 'b' }, state: makeState({ phase, phase_sequence: SEQUENCE }), etag: null } });
}

function select(): HTMLSelectElement {
  return screen.getByRole('combobox') as HTMLSelectElement;
}

function submitButton(): HTMLButtonElement {
  return screen.getByText('buttons.setPhase', { selector: 'button span' }).closest('button') as HTMLButtonElement;
}

function chooseCustomPhase(value: string): HTMLInputElement {
  fireEvent.change(select(), { target: { value: CUSTOM_PHASE } });
  const input = document.querySelector('.gw-dialog-body input') as HTMLInputElement;
  fireEvent.input(input, { target: { value } });
  return input;
}

beforeEach(() => {
  vi.spyOn(store, 'refreshState').mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SetPhaseDialog', () => {
  it('submit_shouldCallServerOnce_whenEnterPressedThreeTimesWhilePending', async () => {
    showWorkspace('2.0');
    vi.mocked(core.setPhase).mockReturnValue(new Promise(() => undefined));
    render(<SetPhaseDialog open onClose={vi.fn()} />);
    const input = chooseCustomPhase('3.1.0');

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await Promise.resolve();

    expect(core.setPhase).toHaveBeenCalledTimes(1);
    expect(core.setPhase).toHaveBeenCalledWith('3.1.0');
  });

  it('submit_shouldNotCallServer_whenCustomInputIsEmpty', async () => {
    showWorkspace('2.0');
    render(<SetPhaseDialog open onClose={vi.fn()} />);
    const input = chooseCustomPhase('   ');

    fireEvent.keyDown(input, { key: 'Enter' });
    await Promise.resolve();

    expect(core.setPhase).not.toHaveBeenCalled();
    expect(submitButton().disabled).toBe(true);
  });

  it('submit_shouldNotCallServer_whenTargetEqualsCurrentPhase', async () => {
    showWorkspace('2.0');
    render(<SetPhaseDialog open onClose={vi.fn()} />);
    const input = chooseCustomPhase('2.0');

    fireEvent.keyDown(input, { key: 'Enter' });
    await Promise.resolve();

    expect(core.setPhase).not.toHaveBeenCalled();
    expect(submitButton().disabled).toBe(true);
  });

  it('open_shouldPreselectCurrentPhaseAndDisableSubmit_whenCurrentPhaseIsOutsideSequence', () => {
    showWorkspace('3.9.1');
    render(<SetPhaseDialog open onClose={vi.fn()} />);

    expect(select().value).toBe('3.9.1');
    expect(submitButton().disabled).toBe(true);
  });

  it('open_shouldEnableSubmit_whenAnotherPresetIsChosen', () => {
    showWorkspace('2.0');
    render(<SetPhaseDialog open onClose={vi.fn()} />);

    fireEvent.change(select(), { target: { value: '2.1' } });

    expect(submitButton().disabled).toBe(false);
  });
});

describe('selectablePhases', () => {
  it('selectablePhases_shouldPrependCurrentPhase_whenItIsNotInSequence', () => {
    expect(selectablePhases(SEQUENCE, '3.9.1')).toEqual(['3.9.1', ...SEQUENCE]);
  });

  it('selectablePhases_shouldKeepSequence_whenCurrentPhaseIsListed', () => {
    expect(selectablePhases(SEQUENCE, '2.0')).toEqual(SEQUENCE);
  });
});

describe('canSubmitPhase', () => {
  it('canSubmitPhase_shouldRejectEmptySamePhaseAndPending', () => {
    expect(canSubmitPhase('', '2.0', false)).toBe(false);
    expect(canSubmitPhase('2.0', '2.0', false)).toBe(false);
    expect(canSubmitPhase('2.1', '2.0', true)).toBe(false);
    expect(canSubmitPhase('2.1', '2.0', false)).toBe(true);
  });
});
