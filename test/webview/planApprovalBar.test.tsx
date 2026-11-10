// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceState } from '../../src/api/types';
import * as core from '../../webview-ui/src/api/core';
import * as planning from '../../webview-ui/src/api/planning';
import { DialogHost } from '../../webview-ui/src/components/DialogHost';
import { PlanApprovalBar, isApprovedPlanInExecution, isPlanDecisionOpen } from '../../webview-ui/src/components/PlanApprovalBar';
import { store } from '../../webview-ui/src/store/store';
import { ApprovalCard } from '../../webview-ui/src/tabs/phase/ApprovalCard';
import { usePlanNavigationAction } from '../../webview-ui/src/tabs/planning/PlanningTab';
import { makeState } from '../support/fixtures';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

vi.mock('../../webview-ui/src/api/core', () => ({
  getAvailablePhases: vi.fn(() => new Promise(() => undefined)),
  setPlanStatus: vi.fn(),
  addComment: vi.fn(),
}));

vi.mock('../../webview-ui/src/api/planning', () => ({ listCriteria: vi.fn() }));

const PLAN = { description: 'Ship it', execution: [{ id: '3.1', name: 'Build', tasks: [] }] };

function showWorkspace(overrides: Partial<WorkspaceState>): void {
  const state = makeState({ phase: '2.1', plan_status: 'pending', ...overrides });
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'p', branch: 'b' }, state, etag: null } });
}

function buttonsLabelled(label: string): HTMLButtonElement[] {
  return screen.getAllByText(label, { selector: 'button span' }).map((span) => span.closest('button') as HTMLButtonElement);
}

function barButtonsLabelled(label: string): HTMLButtonElement[] {
  return buttonsLabelled(label).filter((button) => button.closest('.gw-dialog') === null);
}

function confirmButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('.gw-dialog-footer .gw-button-primary') as HTMLButtonElement;
}

const APPROVE_PLAN_NAV = { tab: 'planning', action: 'approvePlan' } as const;

function ApproveFromNavHost(): null {
  usePlanNavigationAction(APPROVE_PLAN_NAV, true);
  return null;
}

beforeEach(() => {
  vi.mocked(planning.listCriteria).mockResolvedValue({ criteria: [] });
  vi.spyOn(store, 'refreshState').mockResolvedValue(undefined);
  vi.spyOn(store, 'invalidate').mockImplementation(() => undefined);
});

afterEach(async () => {
  for (let dialog = document.querySelector('.gw-dialog'); dialog !== null; dialog = document.querySelector('.gw-dialog')) {
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.gw-dialog')).not.toBe(dialog));
  }
  cleanup();
  vi.clearAllMocks();
});

describe('PlanApprovalBar', () => {
  it('approve_shouldDisableEveryOtherBar_whileOneStatusChangeIsInFlight', async () => {
    showWorkspace({ plan: PLAN });
    let finish: () => void = () => undefined;
    vi.mocked(core.setPlanStatus).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }) as never);
    render(<><DialogHost /><PlanApprovalBar planStatus="pending" /><PlanApprovalBar planStatus="pending" /></>);
    const [firstApprove, secondApprove] = barButtonsLabelled('buttons.approve');

    fireEvent.click(firstApprove);
    fireEvent.click(confirmButton());

    await waitFor(() => expect(secondApprove.disabled).toBe(true));
    expect(barButtonsLabelled('vsc.gate.sendBackPlan').every((button) => button.disabled)).toBe(true);
    fireEvent.click(secondApprove);
    expect(core.setPlanStatus).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(secondApprove.disabled).toBe(false));
  });

  it('approve_shouldNotSpinOrDim_whileConfirmDialogIsOpen', async () => {
    showWorkspace({ plan: PLAN });
    render(<><DialogHost /><PlanApprovalBar planStatus="pending" /></>);
    const approve = barButtonsLabelled('buttons.approve')[0] as HTMLButtonElement;

    fireEvent.click(approve);

    await waitFor(() => expect(document.querySelector('.gw-dialog')).not.toBeNull());
    expect(approve.disabled).toBe(false);
    expect(approve.getAttribute('aria-busy')).toBe('false');
    expect(approve.querySelector('.codicon-loading')).toBeNull();
  });

  it('approve_shouldAskTheSameConfirmationAsTheNavAction_beforeChangingStatus', async () => {
    showWorkspace({ plan: PLAN });
    render(<><DialogHost /><PlanApprovalBar planStatus="pending" /></>);

    fireEvent.click(barButtonsLabelled('buttons.approve')[0] as HTMLButtonElement);

    expect(document.querySelector('.gw-dialog')?.textContent).toContain('vsc.planning.approveConfirmTitle');
    fireEvent.click(screen.getByText('vsc.common.cancel'));
    await waitFor(() => expect(document.querySelector('.gw-dialog')).toBeNull());
    expect(core.setPlanStatus).not.toHaveBeenCalled();
  });

  it('approveFromNav_shouldShowTheSameConfirmationTitle_asTheBar', async () => {
    showWorkspace({ plan: PLAN });
    render(<><DialogHost /><ApproveFromNavHost /></>);

    await waitFor(() => expect(document.querySelector('.gw-dialog')?.textContent).toContain('vsc.planning.approveConfirmTitle'));
  });

  it('approveFromNav_shouldListTheBarsWarnings_butNotPendingCriteria_whenPlanHasPendingCriteriaAndNoScope', async () => {
    vi.mocked(planning.listCriteria).mockResolvedValue({ criteria: [{ id: 1, type: 'f', description: 'd', details: null, source: null, status: 'proposed', validated: null, validation_message: null }] });
    showWorkspace({ plan: PLAN, scope: {} });
    render(<><DialogHost /><ApproveFromNavHost /></>);

    await waitFor(() => expect(document.querySelector('.gw-dialog')).not.toBeNull());
    const notices = Array.from(document.querySelectorAll('.gw-dialog .gw-dialog-notice')).map((notice) => notice.textContent);
    expect(notices).toEqual(['vsc.warning.scopeEmpty']);
  });

  it('render_shouldShowOnlyBadge_whenWorkspaceIsDone', () => {
    showWorkspace({ plan: PLAN, phase: '6', plan_status: 'approved' });
    render(<PlanApprovalBar planStatus="approved" />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('vsc.planning.badgeApproved')).toBeTruthy();
  });
});

describe('ApprovalCard', () => {
  it('render_shouldShowOnlyStatusBadge_whileApprovedPlanIsInCodeReview', () => {
    showWorkspace({ plan: PLAN, phase: '3.2.3', plan_status: 'approved' });
    render(<ApprovalCard />);

    expect(screen.queryByText('buttons.revokeApproval')).toBeNull();
    expect(screen.queryByText('buttons.reject')).toBeNull();
    expect(screen.getByText('vsc.planning.badgeApproved')).toBeTruthy();
  });

  it('render_shouldOfferNoDecisionButtons_whilePlanAwaitsApproval', () => {
    showWorkspace({ plan: PLAN, phase: '2.0', plan_status: 'pending' });
    render(<ApprovalCard />);

    expect(screen.queryByText('buttons.approve')).toBeNull();
    expect(screen.queryByText('buttons.reject')).toBeNull();
    expect(screen.getByText('vsc.planning.badgePending')).toBeTruthy();
    expect(screen.getByText('buttons.viewPlan')).toBeTruthy();
  });

  it('render_shouldHideViewPlan_whenThereIsNoPlan', () => {
    showWorkspace({ plan: {} });
    render(<ApprovalCard />);

    expect(screen.queryByText('buttons.viewPlan')).toBeNull();
  });
});

describe('isPlanDecisionOpen', () => {
  it('isPlanDecisionOpen_shouldBeTrueBeforePhaseFiveWithPlan_andFalseOtherwise', () => {
    expect(isPlanDecisionOpen(PLAN, '4.2', 'pending')).toBe(true);
    expect(isPlanDecisionOpen(PLAN, '5.1', 'pending')).toBe(false);
    expect(isPlanDecisionOpen({}, '2.1', 'pending')).toBe(false);
  });

  it('isPlanDecisionOpen_shouldBeFalse_whileApprovedPlanIsExecutedOrReviewed', () => {
    expect(isPlanDecisionOpen(PLAN, '2.1', 'approved')).toBe(true);
    expect(isPlanDecisionOpen(PLAN, '3.2.3', 'approved')).toBe(false);
    expect(isPlanDecisionOpen(PLAN, '4.2', 'approved')).toBe(false);
    expect(isPlanDecisionOpen(PLAN, '3.1.0', 'rejected')).toBe(true);
  });
});

describe('isApprovedPlanInExecution', () => {
  it('isApprovedPlanInExecution_shouldOnlyHoldForApprovedPlanInPhasesThreeAndFour', () => {
    expect(isApprovedPlanInExecution(PLAN, '3.1.0', 'approved')).toBe(true);
    expect(isApprovedPlanInExecution(PLAN, '4.2', 'approved')).toBe(true);
    expect(isApprovedPlanInExecution(PLAN, '2.1', 'approved')).toBe(false);
    expect(isApprovedPlanInExecution(PLAN, '5.1', 'approved')).toBe(false);
    expect(isApprovedPlanInExecution(PLAN, '3.1.0', 'pending')).toBe(false);
  });
});

describe('usePlanNavigationAction', () => {
  const APPROVE_NAV = { tab: 'planning', action: 'approvePlan' } as const;

  function ApproveFromNav(): null {
    usePlanNavigationAction(APPROVE_NAV, true);
    return null;
  }

  it('approvePlanNav_shouldHoldSharedLockWhileConfirming_soOtherBarsCannotPostToo', async () => {
    showWorkspace({ plan: PLAN });
    vi.mocked(core.setPlanStatus).mockResolvedValue(undefined as never);
    render(<><DialogHost /><ApproveFromNav /><PlanApprovalBar planStatus="pending" /></>);
    const [barApprove] = buttonsLabelled('buttons.approve').filter((button) => !button.closest('.gw-dialog'));

    await waitFor(() => expect(document.querySelectorAll('.gw-dialog')).toHaveLength(1));
    fireEvent.click(barApprove);
    expect(document.querySelectorAll('.gw-dialog')).toHaveLength(1);
    const confirm = document.querySelector<HTMLButtonElement>('.gw-dialog-footer .gw-button-primary') as HTMLButtonElement;
    fireEvent.click(confirm);

    await waitFor(() => expect(barApprove.disabled).toBe(false));
    expect(core.setPlanStatus).toHaveBeenCalledTimes(1);
    expect(core.setPlanStatus).toHaveBeenCalledWith('approved');
  });
});
