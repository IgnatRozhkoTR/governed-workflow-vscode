// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listProposals, type Proposal } from '../../../webview-ui/src/api/reflection';
import { registerModuleMessages } from '../../../webview-ui/src/i18n/i18n';
import { store } from '../../../webview-ui/src/store/store';
import { REFLECTION_MESSAGES } from '../../../webview-ui/src/tabs/reflection/messages';
import { isEveryProposalHandled, proposalProgress } from '../../../webview-ui/src/tabs/reflection/proposalsModel';
import { ReflectionTab } from '../../../webview-ui/src/tabs/reflection/ReflectionTab';
import { makeState } from '../../support/fixtures';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

vi.mock('../../../webview-ui/src/api/reflection', () => ({
  listProposals: vi.fn(),
  resolveProposal: vi.fn(),
}));

registerModuleMessages(REFLECTION_MESSAGES);

function proposal(id: number, status: Proposal['status']): Proposal {
  return {
    id, type: 'rule_new', implementation_kind: 'manual', status, title: `Proposal ${id}`, body: null,
    payload_json: null, reason: null, result_json: null, created_at: '2026-11-09T10:00:00', reviewed_at: null, executed_at: null,
  };
}

function showPhase(phase: string): void {
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'p', branch: `b-${phase}` }, state: makeState({ phase }), etag: null } });
}

function serveProposals(proposals: readonly Proposal[]): void {
  vi.mocked(listProposals).mockResolvedValue({ proposals: [...proposals] });
}

async function progressLine(): Promise<HTMLElement> {
  return waitFor(() => {
    const line = document.querySelector<HTMLElement>('.gw-reflection-progress');
    expect(line).not.toBeNull();
    return line as HTMLElement;
  });
}

function renderTab(): void {
  render(<ReflectionTab active nav={{ tab: 'reflection' }} />);
}

const PARTLY_HANDLED = [proposal(1, 'executed'), proposal(2, 'rejected'), proposal(3, 'failed'), proposal(4, 'proposed'), proposal(5, 'proposed')];
const ALL_HANDLED = [proposal(1, 'executed'), proposal(2, 'rejected')];

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  act(() => store.navigate({ tab: 'reflection' }));
});

afterEach(() => {
  cleanup();
  vi.mocked(listProposals).mockReset();
});

describe('proposalProgress', () => {
  it('proposalProgress_shouldCountEveryNonProposedStatusAsHandled_whenStatusesAreMixed', () => {
    expect(proposalProgress(PARTLY_HANDLED)).toEqual({ handled: 3, total: 5 });
  });

  it('isEveryProposalHandled_shouldBeFalse_whenThereAreNoProposals', () => {
    expect(isEveryProposalHandled(proposalProgress([]))).toBe(false);
  });

  it('isEveryProposalHandled_shouldBeTrue_whenNoProposalIsPending', () => {
    expect(isEveryProposalHandled(proposalProgress(ALL_HANDLED))).toBe(true);
  });
});

describe('ReflectionTab progress', () => {
  it('render_shouldShowHandledCount_whenProposalsArePending', async () => {
    showPhase('5.1');
    serveProposals(PARTLY_HANDLED);

    renderTab();

    expect((await progressLine()).textContent).toBe('3 of 5 handled');
  });

  it('render_shouldSayTheAgentFinishesReflection_whenAllHandledDuringReflection', async () => {
    showPhase('5.1');
    serveProposals(ALL_HANDLED);

    renderTab();

    const status = await progressLine();
    expect(status.textContent).toBe('All 2 proposals handled. The agent will finish reflection; nothing else is needed from you.');
    expect(status.classList.contains('gw-reflection-progress-done')).toBe(true);
  });

  it('render_shouldOnlyReportAllHandled_whenReflectionIsOver', async () => {
    showPhase('6');
    serveProposals(ALL_HANDLED);

    renderTab();

    expect((await progressLine()).textContent).toBe('All 2 proposals handled.');
  });

  it('render_shouldShowNoProgress_whenThereAreNoProposals', async () => {
    showPhase('5.1');
    serveProposals([]);

    renderTab();

    await screen.findByText('proposals.empty');
    expect(document.querySelector('.gw-reflection-progress')).toBeNull();
  });
});

describe('ReflectionTab anchor', () => {
  it('navigate_shouldScrollAndFlashProposals_whenAnchorIsReflectionProposals', async () => {
    showPhase('5.1');
    serveProposals(PARTLY_HANDLED);
    renderTab();
    const proposals = document.getElementById('reflection-proposals') as HTMLElement;

    act(() => store.navigate({ tab: 'reflection', anchor: 'reflection-proposals' }));

    await waitFor(() => expect(proposals.classList.contains('gw-card-highlight')).toBe(true));
    await waitFor(() => expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toContain(proposals));
  });
});
