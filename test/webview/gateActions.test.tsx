// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingGate } from '../../src/api/types';
import * as core from '../../webview-ui/src/api/core';
import { DialogHost } from '../../webview-ui/src/components/DialogHost';
import { GateActions, GateDecisionButtons, approveConfirmMessage, gateCopy, gateTitle, nextPhaseInSequence, sendBackMessage } from '../../webview-ui/src/components/GateActions';
import { registerModuleMessages, setServerMessages } from '../../webview-ui/src/i18n/i18n';
import { store } from '../../webview-ui/src/store/store';
import { makeState } from '../support/fixtures';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

vi.mock('../../webview-ui/src/api/core', () => ({
  getAvailablePhases: vi.fn(() => new Promise(() => undefined)),
  approveGate: vi.fn(),
  rejectGate: vi.fn(),
}));

const SEQUENCE = ['1.1', '1.4', '2.0', '2.1', '3.1.0', '3.1.2', '3.1.3', '3.1.4', '4.1', '4.2', '5.1'];
const translate = (key: string, params?: Record<string, string | number>): string => `${key}${params === undefined ? '' : JSON.stringify(params)}`;
const labelOf = (phase: string): string => phase;

registerModuleMessages({
  en: {
    'vsc.gate.rejectConfirm': 'Request changes and return to {target}?',
    'vsc.phase.approveConfirmTarget': 'Approve {phase} and continue to {target}?',
    'vsc.gate.sendBackTo': 'Send back to {target}',
    'vsc.gate.sendBack': 'Send back',
    'vsc.gate.sendBackResearch': 'Send back to research',
    'vsc.gate.sendBackPlanning': 'Send back to planning',
    'vsc.gate.sendBackFixes': 'Send back for fixes',
    'vsc.gate.approveShip': 'Approve & ship',
    'vsc.gate.approveBlocking': 'Approve ({count} blocking)',
    'vsc.gate.commitHint': 'Approve asks for a commit message',
    'buttons.requestChanges': 'Request Changes',
    'preplanning.rejectPreplanning': 'Reject to Research',
    'buttons.approve': 'Approve',
    'buttons.approveFinish': 'Approve & Finish',
    'buttons.approveChanges': 'Approve Changes',
    'preplanning.approvePreplanning': 'Approve Pre-planning',
  },
  ru: {},
});

function showGate(gate: PendingGate): void {
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'p', branch: 'b' }, state: makeState({ phase: gate.phase, phase_sequence: SEQUENCE, pending_gate: gate }), etag: null } });
}

function renderBarButtons(gate: PendingGate): void {
  showGate(gate);
  render(<><GateDecisionButtons gate={gate} /><DialogHost /></>);
}

function dialogMessage(): string {
  return document.querySelector('.gw-dialog-message')?.textContent ?? '';
}

beforeEach(() => {
  vi.spyOn(store, 'refreshState').mockResolvedValue(undefined);
});

async function dismissOpenDialogs(): Promise<void> {
  for (let dialog = document.querySelector('.gw-dialog'); dialog !== null; dialog = document.querySelector('.gw-dialog')) {
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.gw-dialog')).not.toBe(dialog));
  }
}

afterEach(async () => {
  await dismissOpenDialogs();
  cleanup();
  vi.clearAllMocks();
});

describe('gateTitle', () => {
  it('gateTitle_shouldUseThePhaseChipLabel_forCodeReviewGates', () => {
    expect(gateTitle(translate, (phase) => `Engine — step ${phase}`, '3.2.3')).toBe('Engine — step 3.2.3');
  });

  it('gateTitle_shouldUseTheGateTitle_forOtherGates', () => {
    expect(gateTitle(translate, labelOf, '4.2')).toBe('phaseAction.finalApproval{"phase":"4.2"}');
  });
});

describe('GateActions', () => {
  it('render_shouldOfferNoDecisionOrGateStatus_onlyNonGateActions', () => {
    const gate = { phase: '3.1.3', accepts_commit_message: true };
    showGate(gate);
    render(<GateActions gate={gate} />);

    expect(screen.queryByText('vsc.gate.useDecisionBar')).toBeNull();
    expect(screen.getByText('buttons.setPhase')).toBeTruthy();
    expect(screen.queryByText('Approve Changes')).toBeNull();
    expect(screen.queryByText('buttons.requestChanges')).toBeNull();
    expect(document.querySelector('input, textarea')).toBeNull();
  });

  it('setPhase_shouldOpenSetPhaseDialogAction_onTheCurrentTab', () => {
    const gate = { phase: '4.2', accepts_commit_message: false };
    showGate(gate);
    store.navigate({ tab: 'phase' });
    render(<GateActions gate={gate} />);

    fireEvent.click(screen.getByText('buttons.setPhase'));

    expect(store.getSnapshot().nav).toMatchObject({ tab: 'phase', action: 'setPhase' });
  });
});

describe('GateDecisionButtons', () => {
  it('render_shouldUseWebPreplanningRejectLabel_andShortApprove_whenGateIs14', () => {
    renderBarButtons({ phase: '1.4', accepts_commit_message: false });

    expect(screen.getByText('Approve').closest('button')?.title).toBe('Approve Pre-planning');
    expect(screen.getByText('Send back to research')).toBeTruthy();
  });

  it('render_shouldSayApproveAndShip_whateverTheServerLabelIs_atFinalGate', () => {
    setServerMessages('en', { 'buttons.approveFinish': 'Одобрить' });
    renderBarButtons({ phase: '4.2', accepts_commit_message: false });

    expect(document.querySelector('.gw-button-primary')?.textContent).toBe('Approve & ship');
    setServerMessages('en', {});
  });

  it('render_shouldFallBackToApprove_whenServerApproveLabelIsTooLong', () => {
    setServerMessages('en', { 'buttons.approveChanges': 'Одобрить изменения и продолжить' });
    renderBarButtons({ phase: '3.2.3', accepts_commit_message: true });

    const approve = document.querySelector('.gw-button-primary') as HTMLButtonElement;
    expect(approve.textContent).toBe('Approve');
    setServerMessages('en', {});
  });

  it('render_shouldUseSendBackWithDestinationAndTargetTooltip_forCodeReviewGate', () => {
    renderBarButtons({ phase: '3.2.3', accepts_commit_message: true });

    const reject = document.querySelector('.gw-button-danger') as HTMLButtonElement;
    expect(reject.textContent).toBe('Send back for fixes');
    expect(reject.title).toMatch(/^Send back to 3\.2\.2/);
  });

  it('render_shouldHintAtCommitMessageInApproveTooltipOnly_whenGateAsksForOne', () => {
    renderBarButtons({ phase: '3.2.3', accepts_commit_message: true });

    const approve = document.querySelector('.gw-button-primary') as HTMLButtonElement;
    expect(approve.title).toContain('Approve asks for a commit message');
    expect(screen.queryByText('Approve asks for a commit message')).toBeNull();
  });

  it('render_shouldNotHintAtCommitMessage_whenGateDoesNotAskForOne', () => {
    renderBarButtons({ phase: '4.2', accepts_commit_message: false });

    const approve = document.querySelector('.gw-button-primary') as HTMLButtonElement;
    expect(approve.title).not.toContain('Approve asks for a commit message');
  });

  it('reject_shouldNameResearchAsTarget_whenGateIs14', async () => {
    renderBarButtons({ phase: '1.4', accepts_commit_message: false });

    fireEvent.click(screen.getByText('Send back to research'));

    await waitFor(() => expect(dialogMessage()).toContain('return to 1.1'));
  });

  it('approve_shouldNameNextPhase_whenCommitGateAsksForMessage', async () => {
    renderBarButtons({ phase: '3.1.3', accepts_commit_message: true });

    fireEvent.click(screen.getByText('Approve Changes'));

    await waitFor(() => expect(dialogMessage()).toContain('continue to 3.1.4'));
    expect(document.querySelector('.gw-dialog textarea')).not.toBeNull();
  });

  it('approve_shouldPrefillCommitMessageFromThePlan_whenCommitGateAsksForMessage', async () => {
    const gate = { phase: '3.1.3', accepts_commit_message: true };
    const plan = { execution: [{ id: '3.1', name: 'Discount engine', tasks: [{ title: 'Add rules' }] }] };
    store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'p', branch: 'b' }, state: makeState({ phase: gate.phase, phase_sequence: SEQUENCE, pending_gate: gate, plan }), etag: null } });
    render(<><GateDecisionButtons gate={gate} /><DialogHost /></>);

    fireEvent.click(screen.getByText('Approve Changes'));

    await waitFor(() => expect((document.querySelector('.gw-dialog textarea') as HTMLTextAreaElement).value).toBe('Discount engine\n\n- Add rules'));
    expect(dialogMessage()).toContain('vsc.gate.commitSuggestionNote');
  });

  it('approve_shouldNotSpinOrDim_whileConfirmDialogIsOpen_andTurnBusyOnlyAfterConfirm', async () => {
    let finish: () => void = () => undefined;
    vi.mocked(core.approveGate).mockReturnValue(new Promise((resolve) => { finish = () => resolve({ phase: '4.3' } as never); }) as never);
    renderBarButtons({ phase: '4.2', accepts_commit_message: false });
    const approve = screen.getByText('Approve & ship').closest('button') as HTMLButtonElement;

    fireEvent.click(approve);
    await waitFor(() => expect(document.querySelector('.gw-dialog')).not.toBeNull());
    expect(approve.disabled).toBe(false);
    expect(approve.getAttribute('aria-busy')).toBe('false');

    fireEvent.click(document.querySelector('.gw-dialog-footer .gw-button-primary') as HTMLButtonElement);
    await waitFor(() => expect(approve.getAttribute('aria-busy')).toBe('true'));
    expect(approve.disabled).toBe(true);
    finish();
    await waitFor(() => expect(approve.getAttribute('aria-busy')).toBe('false'));
  });

  it('approve_shouldOpenOneConfirmAndPostOnce_whenClickedTwice', async () => {
    vi.mocked(core.approveGate).mockResolvedValue({ phase: '4.3', previous_phase: '4.2', status: 'ok' } as never);
    renderBarButtons({ phase: '4.2', accepts_commit_message: false });
    const approve = screen.getByText('Approve & ship').closest('button') as HTMLButtonElement;

    fireEvent.click(approve);
    fireEvent.click(approve);
    await waitFor(() => expect(document.querySelectorAll('.gw-dialog')).toHaveLength(1));
    fireEvent.click(document.querySelector('.gw-dialog-footer .gw-button-primary') as HTMLButtonElement);

    await waitFor(() => expect(core.approveGate).toHaveBeenCalledTimes(1));
    expect(core.approveGate).toHaveBeenCalledWith(undefined);
  });
});

describe('gate copy helpers', () => {
  it('gateCopy_shouldMapRejectTargets_forEveryUserGate', () => {
    expect(['1.4', '2.1', '4.2', '3.2.3'].map((phase) => gateCopy(phase).rejectTarget)).toEqual(['1.1', '2.0', '4.1', '3.2.2']);
  });

  it('nextPhaseInSequence_shouldReturnFollowingPhase_orUndefinedAtEnd', () => {
    expect(nextPhaseInSequence(SEQUENCE, '4.2')).toBe('5.1');
    expect(nextPhaseInSequence(SEQUENCE, '5.1')).toBeUndefined();
    expect(nextPhaseInSequence(SEQUENCE, 'x')).toBeUndefined();
  });

  it('approveConfirmMessage_shouldFallBackToPlainQuestion_whenNextPhaseUnknown', () => {
    expect(approveConfirmMessage(translate, labelOf, '2.1', undefined)).toBe('vsc.gate.approveConfirm{"phase":"2.1"}');
  });

  it('approveConfirmMessage_shouldSayWhatFollowsTheLastApproval_atFinalApproval', () => {
    expect(approveConfirmMessage(translate, labelOf, '4.2', '5.1')).toBe('vsc.gate.shipConfirm{"target":"5.1"}');
    expect(approveConfirmMessage(translate, labelOf, '4.2', '6')).toBe('vsc.gate.shipConfirmDone');
    expect(approveConfirmMessage(translate, labelOf, '4.2', undefined)).toBe('vsc.gate.shipConfirmDone');
  });

  it('gateCopy_shouldApproveAndShipWithOneLabel_atFinalApproval', () => {
    expect(gateCopy('4.2').approveKey).toBe('vsc.gate.approveShip');
  });

  it('sendBackMessage_shouldAddTheOpenThreadsSentence_onlyWhenThreadsGoBack', () => {
    expect(sendBackMessage('Send back to 4.1?', '2 open review threads go back with it.')).toBe('Send back to 4.1? 2 open review threads go back with it.');
    expect(sendBackMessage('Send back to 4.1?', undefined)).toBe('Send back to 4.1?');
  });
});
