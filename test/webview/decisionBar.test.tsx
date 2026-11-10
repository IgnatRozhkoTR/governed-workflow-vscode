// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavTarget } from '../../src/shared/navigation';
import type { WorkspaceState } from '../../src/api/types';
import * as changes from '../../webview-ui/src/api/changes';
import * as core from '../../webview-ui/src/api/core';
import * as phaseControl from '../../webview-ui/src/api/phaseControl';
import * as planning from '../../webview-ui/src/api/planning';
import * as reflection from '../../webview-ui/src/api/reflection';
import { DialogHost } from '../../webview-ui/src/components/DialogHost';
import { GateActions } from '../../webview-ui/src/components/GateActions';
import { registerModuleMessages } from '../../webview-ui/src/i18n/i18n';
import { RpcError, rpc } from '../../webview-ui/src/rpc/rpcClient';
import { DecisionBar } from '../../webview-ui/src/shell/DecisionBar';
import { DigestView, findingsSummary } from '../../webview-ui/src/shell/GateDigest';
import { Header } from '../../webview-ui/src/shell/Header';
import { store } from '../../webview-ui/src/store/store';
import { makeComment, makeState } from '../support/fixtures';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

vi.mock('../../webview-ui/src/api/core', () => ({
  getAvailablePhases: vi.fn(() => new Promise(() => undefined)),
  approveGate: vi.fn(),
  rejectGate: vi.fn(),
  setPlanStatus: vi.fn(),
  addComment: vi.fn(),
  setYolo: vi.fn(),
  setLocale: vi.fn(),
  notifyClaude: vi.fn(),
}));

vi.mock('../../webview-ui/src/api/reflection', () => ({ listProposals: vi.fn(() => new Promise(() => undefined)) }));

vi.mock('../../webview-ui/src/api/changes', () => ({
  listRepos: vi.fn(() => new Promise(() => undefined)),
  getDiff: vi.fn(),
  getHistory: vi.fn(),
}));

vi.mock('../../webview-ui/src/api/phaseControl', () => ({ getReviewPipelineSummary: vi.fn(() => new Promise(() => undefined)) }));

vi.mock('../../webview-ui/src/api/planning', () => ({ listCriteria: vi.fn(() => new Promise(() => undefined)) }));

// The web's English approve labels: the bar keeps those of 18 characters or fewer and shortens the rest to "Approve".
registerModuleMessages({
  en: {
    'buttons.approveChanges': 'Approve Changes',
    'buttons.approveFinish': 'Approve & Finish',
    'vsc.gate.approveShip': 'Approve & ship',
    'vsc.gate.approveBlocking': 'Approve ({count} blocking)',
  },
  ru: {},
});

// The digest keeps an invisible copy of every chip to measure their natural widths; queries look at the shown ones.
configure({ defaultIgnore: 'script, style, .gw-gate-digest-measure *' });

const SHOWN_CHIPS = '.gw-decision-bar-row .gw-gate-digest-chip';

const FINAL_GATE = { phase: '4.2', accepts_commit_message: false };
const BLOCKING_THREAD = makeComment({ id: 7, scope: 'review', target: 'app.py', resolution: 'open' });

function proposal(id: number, status: string): unknown {
  return { id, type: 'rule', implementation_kind: 'auto', status, title: `P${id}`, body: null, payload_json: null, reason: null, result_json: null, created_at: '', reviewed_at: null, executed_at: null };
}

function decisionBarLinks(): string[] {
  return Array.from(document.querySelectorAll('.gw-decision-bar-link')).map((link) => link.textContent ?? '');
}

function digestChip(text: string): HTMLElement {
  return screen.getAllByText(text).map((element) => element.closest('.gw-gate-digest-chip') as HTMLElement).find((chip) => chip !== null) as HTMLElement;
}

function dialogNotices(): string[] {
  return Array.from(document.querySelectorAll('.gw-dialog .gw-dialog-notice')).map((notice) => notice.textContent ?? '');
}

const CODE_REVIEW_GATE = { phase: '3.1.3', accepts_commit_message: true };
const PLAN = { description: 'Ship it', execution: [{ id: '3.1', name: 'Build', tasks: [] }] };

function showWorkspace(overrides: Partial<WorkspaceState>, nav: NavTarget = { tab: 'settings' }): void {
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'p', branch: 'b' }, state: makeState(overrides), etag: null } });
  store.navigate(nav);
}

function button(label: string): HTMLButtonElement {
  return screen.getAllByText(label).map((element) => element.closest('button') as HTMLButtonElement).find((candidate) => candidate.closest('.gw-dialog') === null) as HTMLButtonElement;
}

function dialogInput(): HTMLInputElement | HTMLTextAreaElement {
  return document.querySelector('.gw-dialog input, .gw-dialog textarea') as HTMLInputElement;
}

function dialogConfirm(): HTMLButtonElement {
  return document.querySelector('.gw-dialog-footer .gw-button:last-child') as HTMLButtonElement;
}

beforeEach(() => {
  vi.spyOn(store, 'refreshState').mockResolvedValue(undefined);
  vi.spyOn(store, 'invalidate').mockImplementation(() => undefined);
  vi.spyOn(rpc, 'call').mockReturnValue(new Promise(() => undefined) as never);
});

afterEach(async () => {
  for (let dialog = document.querySelector('.gw-dialog'); dialog !== null; dialog = document.querySelector('.gw-dialog')) {
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.gw-dialog')).not.toBe(dialog));
  }
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('DecisionBar', () => {
  it('render_shouldLeadToMaterialThroughDigestChipsOnly_whenGateWaits', () => {
    showWorkspace({ phase: '3.1.3', pending_gate: CODE_REVIEW_GATE });
    render(<DecisionBar />);

    const filesChip = digestChip('vsc.digest.filesChip');
    fireEvent.click(filesChip);

    expect(decisionBarLinks()).toEqual([]);
    expect(filesChip.getAttribute('title')).toContain('vsc.digest.opens');
    expect(store.getSnapshot().nav).toMatchObject({ tab: 'changes' });
    expect(rpc.call).toHaveBeenCalledWith('panel.rememberTab', { tab: 'changes' });
  });

  it('approve_shouldShowCommitIconAndTooltip_whenGateAcceptsCommitMessage', () => {
    showWorkspace({ phase: '3.1.3', pending_gate: CODE_REVIEW_GATE });
    render(<DecisionBar />);

    const approve = button('Approve Changes');

    expect(approve.querySelector('.codicon-git-commit')).not.toBeNull();
    expect(approve.getAttribute('title')).toBe('vsc.gate.approveAndCommit\nvsc.gate.commitHint');
  });

  it('approve_shouldAskForCommitMessageInDialog_andPostItOnce', async () => {
    vi.mocked(core.approveGate).mockResolvedValue({ phase: '3.2.0' } as never);
    showWorkspace({ phase: '3.1.3', pending_gate: CODE_REVIEW_GATE });
    render(<><DecisionBar /><DialogHost /></>);

    fireEvent.click(button('Approve Changes'));
    fireEvent.input(dialogInput(), { target: { value: '  feat: ship  ' } });
    fireEvent.click(dialogConfirm());

    await waitFor(() => expect(core.approveGate).toHaveBeenCalledTimes(1));
    expect(core.approveGate).toHaveBeenCalledWith('feat: ship');
  });

  it('contract_shouldKeepApproveAndRejectInTheBarOnly_whenGateCardIsAlsoShown', () => {
    const gate = { phase: '4.2', accepts_commit_message: false };
    showWorkspace({ phase: '4.2', pending_gate: gate }, { tab: 'phase' });
    render(<><DecisionBar /><div class="gate-card"><GateActions gate={gate} /></div></>);

    const approves = screen.getAllByText('Approve & ship').map((element) => element.closest('button') as HTMLButtonElement);
    const rejects = Array.from(document.querySelectorAll<HTMLButtonElement>('button.gw-button-danger'));
    expect(approves).toHaveLength(1);
    expect(rejects).toHaveLength(1);
    expect(approves[0]?.closest('.gw-decision-bar')).not.toBeNull();
    expect(rejects[0]?.closest('.gw-decision-bar')).not.toBeNull();
    expect(document.querySelector('.gate-card button.gw-button-primary, .gate-card button.gw-button-danger')).toBeNull();
    expect(document.querySelector('.gate-card')?.textContent).not.toContain('vsc.gate.useDecisionBar');
  });

  it('headerChip_shouldFocusTheBarApprove_whenGateWaits', () => {
    showWorkspace({ phase: '4.2', pending_gate: { phase: '4.2', accepts_commit_message: false } });
    render(<><Header /><DecisionBar /></>);

    fireEvent.click(document.querySelector('.gw-header-phase-chip-waiting') as HTMLButtonElement);

    expect(document.activeElement).toBe(button('Approve & ship'));
  });

  it('headerChip_shouldFocusTheBarApprove_whenPlanAwaitsDecision', () => {
    showWorkspace({ phase: '2.0', plan: PLAN, plan_status: 'pending' }, { tab: 'research' });
    render(<><Header /><DecisionBar /></>);

    fireEvent.click(document.querySelector('.gw-header-phase-chip-waiting') as HTMLButtonElement);

    expect(document.activeElement).toBe(button('buttons.approve'));
  });

  it('reject_shouldPostWithoutANote_whenFeedbackIsLeftEmpty', async () => {
    vi.mocked(core.rejectGate).mockResolvedValue({ phase: '4.1' } as never);
    showWorkspace({ phase: '4.2', pending_gate: { phase: '4.2', accepts_commit_message: false } });
    render(<><DecisionBar /><DialogHost /></>);

    fireEvent.click(document.querySelector('.gw-decision-bar button.gw-button-danger') as HTMLButtonElement);
    expect(dialogConfirm().disabled).toBe(false);
    fireEvent.click(dialogConfirm());

    await waitFor(() => expect(core.rejectGate).toHaveBeenCalledWith(''));
  });

  it('reject_shouldPostTheNote_whenFeedbackIsGiven', async () => {
    vi.mocked(core.rejectGate).mockResolvedValue({ phase: '4.1' } as never);
    showWorkspace({ phase: '4.2', pending_gate: { phase: '4.2', accepts_commit_message: false } });
    render(<><DecisionBar /><DialogHost /></>);

    fireEvent.click(document.querySelector('.gw-decision-bar button.gw-button-danger') as HTMLButtonElement);
    fireEvent.input(dialogInput(), { target: { value: 'Fix the tests' } });
    fireEvent.click(dialogConfirm());

    await waitFor(() => expect(core.rejectGate).toHaveBeenCalledWith('Fix the tests'));
  });

  it('render_shouldPinPendingPlanWithPlanChip_awayFromPlanning', () => {
    showWorkspace({ phase: '2.0', plan: PLAN, plan_status: 'pending' }, { tab: 'research' });
    render(<DecisionBar />);

    expect(screen.getByText('vsc.decision.planTitle')).toBeTruthy();
    fireEvent.click(digestChip('vsc.digest.planChip'));
    expect(store.getSnapshot().nav).toMatchObject({ tab: 'planning', anchor: 'plan-execution' });
  });

  it('render_shouldKeepRevokeOnPlanningOnly_whenPlanIsApprovedBeforeExecution', () => {
    showWorkspace({ phase: '2.1', plan: PLAN, plan_status: 'approved' }, { tab: 'research' });
    const { unmount } = render(<DecisionBar />);
    expect(document.querySelector('.gw-decision-bar')).toBeNull();
    unmount();

    store.navigate({ tab: 'planning' });
    render(<DecisionBar />);
    expect(screen.getByText('buttons.revokeApproval')).toBeTruthy();
  });

  it('render_shouldShowNothing_whenNoDecisionWaits', () => {
    showWorkspace({ phase: '3.1.0', plan: PLAN, plan_status: 'approved' });
    render(<DecisionBar />);

    expect(document.querySelector('.gw-decision-bar')).toBeNull();
  });
});

describe('DecisionBar reflection attention', () => {
  it('render_shouldPointAtProposalsWithoutDecisionButtons_whenProposalsAwaitReviewAtReflection', async () => {
    vi.mocked(reflection.listProposals).mockResolvedValue({ proposals: [proposal(1, 'proposed'), proposal(2, 'proposed'), proposal(3, 'executed')] } as never);
    showWorkspace({ phase: '5.1' });
    render(<DecisionBar />);

    await waitFor(() => expect(screen.getByText('vsc.decision.proposalsTitle.other')).toBeTruthy());
    expect(document.querySelector('.gw-decision-bar .gw-button-primary, .gw-decision-bar .gw-button-danger')).toBeNull();
    fireEvent.click(button('vsc.decision.reviewProposals'));
    expect(store.getSnapshot().nav).toMatchObject({ tab: 'reflection', anchor: 'reflection-proposals' });
  });

  it('render_shouldShowNothing_whenNoProposalIsStillProposed', async () => {
    vi.mocked(reflection.listProposals).mockResolvedValue({ proposals: [proposal(1, 'executed')] } as never);
    showWorkspace({ phase: '5.1' });
    render(<DecisionBar />);

    await waitFor(() => expect(reflection.listProposals).toHaveBeenCalled());
    expect(document.querySelector('.gw-decision-bar')).toBeNull();
  });
});

describe('DecisionBar final approval digest', () => {
  beforeEach(() => {
    vi.mocked(changes.listRepos).mockResolvedValue({ repos: [{ path: '.' }] } as never);
    vi.mocked(changes.getHistory).mockResolvedValue({ commits: [{}, {}, {}] } as never);
    vi.mocked(changes.getDiff).mockImplementation(async (query) => ({ files: query.mode === 'branch' ? [{ path: 'a.py' }, { path: 'b.py' }] : [] }) as never);
  });

  it('digest_shouldSummariseCommitsFilesThreadsAndPipeline_whenFinalApprovalWaits', async () => {
    vi.mocked(phaseControl.getReviewPipelineSummary).mockRejectedValue(new RpcError('not_found', 'none', 404));
    showWorkspace({ phase: '4.2', pending_gate: FINAL_GATE });
    render(<DecisionBar />);

    await waitFor(() => expect(screen.getByText('vsc.digest.pipelineNotRun')).toBeTruthy());
    await waitFor(() => expect(changes.getDiff).toHaveBeenCalled());
    const chips = Array.from(document.querySelectorAll(SHOWN_CHIPS)).map((chip) => chip.textContent);
    expect(chips).toEqual(['vsc.digest.commitsChip', 'vsc.digest.filesChip', 'vsc.digest.threadsChip', 'vsc.digest.findingsChip', 'vsc.digest.pipelineNotRun']);
  });

  it('digest_shouldSplitCommittedAndUncommittedFiles_likeCodeChanges', async () => {
    vi.mocked(changes.getDiff).mockImplementation(async (query) => ({ files: query.mode === 'branch' ? [{ path: 'a.py' }, { path: 'b.py' }] : [{ path: 'b.py' }] }) as never);
    showWorkspace({ phase: '4.2', pending_gate: FINAL_GATE });
    render(<DecisionBar />);

    await waitFor(() => expect(screen.getByText('vsc.digest.filesSplitChip')).toBeTruthy());
  });

  it('digest_shouldOfferNoExpander_whenEveryChipIsShown', () => {
    showWorkspace({ phase: '4.2', pending_gate: FINAL_GATE });
    render(<DecisionBar />);

    expect(document.querySelector('button.gw-gate-digest-toggle')).toBeNull();
  });

  it('digest_shouldStateZeroThreadsAsText_whenNothingBlocks', () => {
    showWorkspace({ phase: '4.2', pending_gate: FINAL_GATE });
    render(<DecisionBar />);

    const threadsChip = screen.getByText('vsc.digest.threadsChip').closest('.gw-gate-digest-chip') as HTMLElement;
    expect(threadsChip.tagName).toBe('SPAN');
  });

  it('digest_shouldLeadWithBlockingThreadsAsWarningLinkedToReview_whenThreadsBlockApproval', () => {
    showWorkspace({ phase: '4.2', pending_gate: FINAL_GATE, comments: { 'app.py': [BLOCKING_THREAD] } });
    render(<DecisionBar />);

    const chips = Array.from(document.querySelectorAll(SHOWN_CHIPS));
    expect(chips[0]?.textContent).toBe('vsc.blocker.threads.one');
    expect(chips[0]?.classList.contains('gw-gate-digest-warning')).toBe(true);
    expect(screen.queryByText('vsc.digest.threadsChip')).toBeNull();
    fireEvent.click(chips[0] as HTMLButtonElement);
    expect(store.getSnapshot().nav).toMatchObject({ tab: 'review', anchor: 'review-blocking' });
  });

  it('digest_shouldTallyReviewFindingsByResolution_whenFinalApprovalWaits', () => {
    const findings = [
      makeComment({ id: 1, scope: 'review', target: 'a.py', resolution: 'fixed' }),
      makeComment({ id: 2, scope: 'review', target: 'a.py', resolution: 'fixed' }),
      makeComment({ id: 3, scope: 'review', target: 'a.py', resolution: 'false_positive' }),
    ];
    showWorkspace({ phase: '4.2', pending_gate: FINAL_GATE, comments: { 'a.py': findings } });
    render(<DecisionBar />);

    const chip = screen.getByText('vsc.digest.findingsChip').closest('.gw-gate-digest-chip') as HTMLElement;
    expect(chip.getAttribute('title')).toContain('vsc.digest.findingsDetail');
    fireEvent.click(chip);
    expect(store.getSnapshot().nav).toMatchObject({ tab: 'review' });
  });
});

describe('DecisionBar gate warnings', () => {
  const PREPLANNING_GATE = { phase: '1.4', accepts_commit_message: false };
  const RESEARCH = [
    { id: 1, topic: 'a', summary: '', findings: null, proven: 1, proven_notes: null, discussion_id: null, created_at: '' },
    { id: 2, topic: 'b', summary: '', findings: null, proven: -1, proven_notes: null, discussion_id: null, created_at: '' },
    { id: 3, topic: 'c', summary: '', findings: null, proven: 0, proven_notes: null, discussion_id: null, created_at: '' },
  ];

  it('digest_shouldLeadWithWarningChips_whenPreplanningHasRejectedAndUnprovenResearch', () => {
    showWorkspace({ phase: '1.4', pending_gate: PREPLANNING_GATE, research: RESEARCH });
    render(<DecisionBar />);

    const chips = Array.from(document.querySelectorAll(SHOWN_CHIPS));
    expect(chips.slice(0, 2).map((chip) => chip.textContent)).toEqual(['vsc.warning.researchRejected', 'vsc.warning.researchUnproven']);
    expect(chips.slice(0, 2).every((chip) => chip.classList.contains('gw-gate-digest-warning'))).toBe(true);
  });

  it('approve_shouldListWarningsWithLinksAndStillApprove_whenPreplanningHasWarnings', async () => {
    vi.mocked(core.approveGate).mockResolvedValue({ phase: '2.0' } as never);
    showWorkspace({ phase: '1.4', pending_gate: PREPLANNING_GATE, research: RESEARCH });
    render(<><DecisionBar /><DialogHost /></>);

    fireEvent.click(button('buttons.approve'));
    expect(dialogNotices()).toEqual(['vsc.warning.researchRejected', 'vsc.warning.researchUnproven']);
    fireEvent.click(dialogConfirm());

    await waitFor(() => expect(core.approveGate).toHaveBeenCalledTimes(1));
  });

  it('dialogNotice_shouldCancelApprovalAndOpenMaterial_whenClicked', async () => {
    showWorkspace({ phase: '1.4', pending_gate: PREPLANNING_GATE, research: RESEARCH });
    render(<><DecisionBar /><DialogHost /></>);

    fireEvent.click(button('buttons.approve'));
    fireEvent.click(document.querySelector('.gw-dialog .gw-dialog-notice') as HTMLButtonElement);

    await waitFor(() => expect(document.querySelector('.gw-dialog')).toBeNull());
    expect(core.approveGate).not.toHaveBeenCalled();
    expect(store.getSnapshot().nav).toMatchObject({ tab: 'preplanning', anchor: 'preplanning-research' });
  });

  it('approve_shouldShowNoNotices_whenNothingNeedsChecking', () => {
    showWorkspace({ phase: '1.4', pending_gate: PREPLANNING_GATE, research: [RESEARCH[0]] });
    render(<><DecisionBar /><DialogHost /></>);

    fireEvent.click(button('buttons.approve'));

    expect(document.querySelector('.gw-dialog')).not.toBeNull();
    expect(dialogNotices()).toEqual([]);
  });

  it('planApprove_shouldWarnAboutEmptyScope_whenPlanAwaitsApproval', () => {
    showWorkspace({ phase: '2.0', plan: PLAN, plan_status: 'pending', scope: {} }, { tab: 'research' });
    render(<><DecisionBar /><DialogHost /></>);

    fireEvent.click(button('buttons.approve'));

    expect(dialogNotices()).toContain('vsc.warning.scopeEmpty');
  });
});

describe('DecisionBar criteria chip', () => {
  function criterion(id: number, status: string): unknown {
    return { id, type: 'unit_test', description: `C${id}`, details: null, source: null, status, validated: null, validation_message: null };
  }

  function chipTexts(): string[] {
    return Array.from(document.querySelectorAll(SHOWN_CHIPS)).map((chip) => chip.textContent ?? '');
  }

  it('digest_shouldStatePendingCriteriaAsAcceptedOnApproval_withoutAnyWarning', async () => {
    vi.mocked(planning.listCriteria).mockResolvedValue({ criteria: [criterion(1, 'proposed'), criterion(2, 'accepted')] } as never);
    showWorkspace({ phase: '2.0', plan: PLAN, plan_status: 'pending', scope: { '3.1': { must: ['a.py'], may: [] } } as never }, { tab: 'research' });
    render(<><DecisionBar /><DialogHost /></>);

    await waitFor(() => expect(chipTexts()).toContain('vsc.digest.criteriaToAccept.one'));
    expect(chipTexts()).not.toContain('vsc.digest.criteriaChip');
    const chip = digestChip('vsc.digest.criteriaToAccept.one');
    expect(chip.classList.contains('gw-gate-digest-warning')).toBe(false);
    expect(chip.getAttribute('title')).toContain('vsc.digest.criteriaDetail');
    fireEvent.click(button('buttons.approve'));
    expect(dialogNotices()).toEqual([]);
  });

  it('digest_shouldShowPlainCriteriaTotal_whenNothingIsPending', async () => {
    vi.mocked(planning.listCriteria).mockResolvedValue({ criteria: [criterion(1, 'accepted')] } as never);
    showWorkspace({ phase: '2.0', plan: PLAN, plan_status: 'pending', scope: { '3.1': { must: ['a.py'], may: [] } } as never }, { tab: 'research' });
    render(<DecisionBar />);

    await waitFor(() => expect(planning.listCriteria).toHaveBeenCalled());
    await waitFor(() => expect(digestChip('vsc.digest.criteriaChip').classList.contains('gw-gate-digest-warning')).toBe(false));
    expect(chipTexts()).not.toContain('vsc.digest.criteriaToAccept.one');
  });
});

describe('DecisionBar below 600px', () => {
  const ITEMS = [
    { id: 'files', icon: 'diff', chip: 'Files: 3', detail: 'Files: 3', nav: { tab: 'changes' } },
    { id: 'threads', icon: 'comment-discussion', chip: 'Threads: 0', detail: 'Threads: 0' },
  ] as const;
  const WARNING = { id: 'scope-empty', messageKey: 'vsc.warning.scopeEmpty', count: 1, nav: { tab: 'planning', anchor: 'plan-scope' } } as const;
  const SECOND_WARNING = { id: 'diagrams-failed', messageKey: 'vsc.warning.diagramsFailed', count: 1, nav: { tab: 'planning', anchor: 'plan-diagram-failed' } } as const;
  const BLOCKER = { id: 'threads', messageKey: 'vsc.blocker.threads', count: 8, hasPluralForms: true, nav: { tab: 'review', anchor: 'review-blocking' } } as const;

  function visibleChips(): string[] {
    return Array.from(document.querySelectorAll(SHOWN_CHIPS)).map((chip) => chip.textContent ?? '');
  }

  function stubWidth(widthPx: number): void {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(widthPx);
  }

  it('render_shouldSwitchToTwoRowLayout_whenBarIsNarrowerThan600px', () => {
    stubWidth(480);
    showWorkspace({ phase: '3.1.3', pending_gate: CODE_REVIEW_GATE });
    render(<DecisionBar />);

    const bar = document.querySelector('.gw-decision-bar') as HTMLElement;
    expect(bar.classList.contains('gw-decision-bar-overflow')).toBe(true);
    expect(visibleChips()).toEqual(['vsc.digest.filesChip', 'vsc.digest.threadsChip', 'vsc.digest.verificationChip']);
  });

  it('render_shouldKeepOneRow_whenBarIsWide', () => {
    stubWidth(1280);
    showWorkspace({ phase: '3.1.3', pending_gate: CODE_REVIEW_GATE });
    render(<DecisionBar />);

    const bar = document.querySelector('.gw-decision-bar') as HTMLElement;
    expect(bar.classList.contains('gw-decision-bar-full')).toBe(true);
    expect(bar.classList.contains('gw-decision-bar-overflow')).toBe(false);
  });

  it('render_shouldLeadWithTheWarningChip_thenPlainChips', () => {
    showWorkspace({ phase: '2.0' });
    render(<DigestView digest={{ items: ITEMS, warnings: [WARNING], blockers: [] }} />);

    expect(visibleChips()).toEqual(['vsc.warning.scopeEmpty', 'Files: 3', 'Threads: 0']);
  });

  it('render_shouldWrapWarningsToSecondRow_andPlaceShortMoreAfterThem_whenRowIsTooNarrow', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100 } as DOMRect);
    stubWidth(200);
    showWorkspace({ phase: '2.0' });
    render(<DigestView digest={{ items: ITEMS, warnings: [WARNING, SECOND_WARNING], blockers: [BLOCKER] }} />);

    expect(visibleChips()).toEqual(['vsc.blocker.threads.other', 'vsc.warning.scopeEmpty', 'vsc.warning.diagramsFailed']);
    expect(Array.from(document.querySelectorAll(SHOWN_CHIPS)).every((chip) => chip.classList.contains('gw-gate-digest-warning'))).toBe(true);
    expect(document.querySelector('.gw-gate-digest-second-row')?.textContent).toContain('vsc.warning.diagramsFailed');
    expect(screen.queryByText('Files: 3')).toBeNull();
    expect(document.querySelector('.gw-gate-digest-second-row > :last-child .gw-gate-digest-more')?.textContent).toBe('vsc.digest.moreShort');
    const toggle = document.querySelector('.gw-gate-digest-second-row > button.gw-gate-digest-toggle');
    expect([toggle?.getAttribute('aria-haspopup'), toggle?.getAttribute('aria-expanded')]).toEqual(['dialog', 'false']);
  });

  it('render_shouldPromoteBlockingThreadsToFirstWarning_atCodeReviewBelow600px', () => {
    stubWidth(480);
    showWorkspace({ phase: '3.1.3', pending_gate: CODE_REVIEW_GATE, comments: { 'app.py': [BLOCKING_THREAD] } });
    render(<DecisionBar />);

    expect(document.querySelector('.gw-decision-bar')?.classList.contains('gw-decision-bar-overflow')).toBe(true);
    expect(visibleChips()[0]).toBe('vsc.blocker.threads.one');
    expect(document.querySelector(SHOWN_CHIPS)?.classList.contains('gw-gate-digest-warning')).toBe(true);
  });
});

describe('DecisionBar approval refused by review threads', () => {
  const OTHER_THREAD = makeComment({ id: 8, scope: 'review', target: 'lib.py', resolution: 'open' });

  function showBlockedGate(gate: typeof CODE_REVIEW_GATE, isYolo: boolean): void {
    showWorkspace({ phase: gate.phase, pending_gate: gate, yolo_mode: isYolo, comments: { 'app.py': [BLOCKING_THREAD], 'lib.py': [OTHER_THREAD] } });
    render(<><DecisionBar /><DialogHost /></>);
  }

  it('approve_shouldSayUpFrontThatThreadsBlock_whenServerWouldRefuse', () => {
    showBlockedGate(CODE_REVIEW_GATE, false);

    const approve = button('Approve (2 blocking)');
    expect(approve.title).toBe('vsc.blocker.threads.other');
    expect(approve.classList.contains('gw-button-primary')).toBe(false);
    expect(approve.querySelector('.codicon-lock')).not.toBeNull();
  });

  it('approve_shouldOpenBlockingThreadsWithoutPosting_whenServerWouldRefuse', () => {
    showBlockedGate({ phase: '4.2', accepts_commit_message: false }, false);

    fireEvent.click(button('Approve (2 blocking)'));

    expect(document.querySelector('.gw-dialog')).toBeNull();
    expect(core.approveGate).not.toHaveBeenCalled();
    expect(store.getSnapshot().nav).toMatchObject({ tab: 'review', anchor: 'review-blocking' });
  });

  it('approve_shouldListThreadsAsWarningAndStillApprove_whenYoloLetsTheServerAllowIt', async () => {
    vi.mocked(core.approveGate).mockResolvedValue({ phase: '4.3' } as never);
    showBlockedGate({ phase: '4.2', accepts_commit_message: false }, true);

    const approve = button('Approve & ship');
    expect(approve.classList.contains('gw-button-primary')).toBe(true);
    fireEvent.click(approve);
    await waitFor(() => expect(dialogNotices()).toEqual(['vsc.blocker.threads.other']));
    fireEvent.click(dialogConfirm());

    await waitFor(() => expect(core.approveGate).toHaveBeenCalledTimes(1));
  });
});

describe('findingsSummary', () => {
  const translate = ((key: string, params?: Record<string, string | number>): string => (
    key === 'vsc.digest.findingsPart' ? `${params?.count} ${params?.resolution}` : key
  )) as Parameters<typeof findingsSummary>[0];

  it('findingsSummary_shouldListOnlyPresentResolutionsInOrder', () => {
    expect(findingsSummary(translate, { fixed: 5, false_positive: 2, out_of_scope: 0, open: 1 }))
      .toBe('5 review.resolution.fixed · 2 review.resolution.false_positive · 1 vsc.digest.findingOpen');
  });

  it('findingsSummary_shouldSayNone_whenThereAreNoFindings', () => {
    expect(findingsSummary(translate, { fixed: 0, false_positive: 0, out_of_scope: 0, open: 0 })).toBe('vsc.digest.findingsNone');
  });
});
