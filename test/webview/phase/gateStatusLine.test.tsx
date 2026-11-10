// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import type { WorkspaceState } from '@api-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listProposals } from '../../../webview-ui/src/api/reflection';
import { store } from '../../../webview-ui/src/store/store';
import { GateStatusLine } from '../../../webview-ui/src/tabs/phase/GateStatusLine';
import { splitCaption } from '../../../webview-ui/src/tabs/phase/phaseBarModel';

vi.mock('../../../webview-ui/src/api/reflection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../webview-ui/src/api/reflection')>()),
  listProposals: vi.fn(),
}));

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

afterEach(cleanup);

function loadState(overrides: Partial<WorkspaceState>): void {
  const state = { workspace_id: 1, phase: '3.1', phase_sequence: ['3.1', '4.2'], pending_gate: null, plan: {}, plan_status: null, comments: {}, research: [], discussions: [], ...overrides } as unknown as WorkspaceState;
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'proj', branch: 'b' }, state, etag: null } });
}

describe('GateStatusLine', () => {
  beforeEach(() => {
    vi.mocked(listProposals).mockResolvedValue({ proposals: [] } as Awaited<ReturnType<typeof listProposals>>);
  });

  it('render_shouldLeaveTheWaitingGateToTheDecisionBar_whenGateWaits', () => {
    loadState({ phase: '4.2', pending_gate: { phase: '4.2', accepts_commit_message: false } });
    const { container } = render(<GateStatusLine />);

    expect(container.innerHTML).toBe('');
  });

  it('render_shouldLeavePlanApprovalToTheDecisionBar_whenPlanWaitsWithoutGate', () => {
    loadState({ phase: '2.0', plan: { description: 'Do it', execution: [] }, plan_status: 'pending' });
    const { container } = render(<GateStatusLine />);

    expect(container.innerHTML).toBe('');
  });

  it('render_shouldSayNoActionIsNeeded_whenNothingWaits', () => {
    loadState({});
    const { container } = render(<GateStatusLine />);

    expect(container.textContent).toContain('phase.noActionRequired');
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('splitCaption', () => {
  it('splitCaption_shouldKeepFirstWordApart_whenCaptionHasSeveralWords', () => {
    expect(splitCaption('Финальное одобрение')).toEqual({ lead: 'Финальное', rest: 'одобрение' });
    expect(splitCaption('Address & Fix')).toEqual({ lead: 'Address', rest: '& Fix' });
  });

  it('splitCaption_shouldReturnWholeCaption_whenCaptionIsOneWord', () => {
    expect(splitCaption('3.1')).toEqual({ lead: '3.1', rest: '' });
  });
});
