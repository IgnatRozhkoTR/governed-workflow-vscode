import * as vscode from 'vscode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/errors';
import type { WorkspaceRef, WorkspaceState } from '../src/api/types';
import { PROTOCOL_VERSION, type HostMessage } from '../src/shared/protocol';
import { registerControlPanel, type ControlPanelDeps, type WorkspaceControlPanelHost } from '../src/webview/controlPanel';
import { ReadyGatedNavigation } from '../src/webview/readyGatedNavigation';
import { makeState } from './support/fixtures';

vi.mock('vscode', async (importOriginal) => ({ ...(await importOriginal<object>()), ViewColumn: { Active: -1 } }));

const REF: WorkspaceRef = { projectId: 'shop', branch: 'feature/gate' };
const GATE_STATE = makeState({ phase: '4.2', pending_gate: { phase: '4.2', accepts_commit_message: false } });

interface Harness {
  readonly posted: HostMessage[];
  readonly receive: (message: unknown) => Promise<void>;
  readonly publishState: (state: WorkspaceState) => void;
  readonly host: WorkspaceControlPanelHost;
}

function fakeActiveWorkspace(): { readonly active: ControlPanelDeps['active']; readonly publishState: (state: WorkspaceState) => void } {
  const stateEmitter = new vscode.EventEmitter<WorkspaceState>();
  const workspaceEmitter = new vscode.EventEmitter<WorkspaceRef | undefined>();
  const holder: { state: WorkspaceState | undefined } = { state: undefined };
  const active = {
    ref: REF,
    poller: undefined,
    setPanelVisible: vi.fn(),
    get state() {
      return holder.state;
    },
    onDidChange: workspaceEmitter.event,
    onDidChangeState: stateEmitter.event,
  } as unknown as ControlPanelDeps['active'];
  const publishState = (state: WorkspaceState): void => {
    holder.state = state;
    stateEmitter.fire(state);
  };
  return { active, publishState };
}

function fakePanel(posted: HostMessage[], onReceive: (handler: (message: unknown) => void) => void): vscode.WebviewPanel {
  const noop = { dispose: () => undefined };
  return {
    webview: {
      options: {},
      html: '',
      cspSource: 'vscode-resource:',
      asWebviewUri: (uri: vscode.Uri) => uri,
      postMessage: async (message: HostMessage) => {
        posted.push(message);
        return true;
      },
      onDidReceiveMessage: (handler: (message: unknown) => void) => {
        onReceive(handler);
        return noop;
      },
    },
    onDidChangeViewState: () => noop,
    onDidDispose: () => noop,
    reveal: vi.fn(),
    dispose: vi.fn(),
  } as unknown as vscode.WebviewPanel;
}

interface PanelOptions {
  readonly request?: (spec: unknown) => Promise<unknown>;
  readonly rememberedTab?: string;
}

function openPanel(options: PanelOptions = {}): Harness {
  const posted: HostMessage[] = [];
  let handler: (message: unknown) => void = () => undefined;
  const { active, publishState } = fakeActiveWorkspace();
  Object.assign(vscode.window, {
    createWebviewPanel: () => fakePanel(posted, (registered) => { handler = registered; }),
    registerWebviewPanelSerializer: () => ({ dispose: () => undefined }),
  });
  const memento = { get: () => options.rememberedTab, update: async () => undefined, keys: () => [] };
  const context = { subscriptions: [], extensionUri: vscode.Uri.file('/ext'), globalState: memento } as unknown as vscode.ExtensionContext;
  const client = { request: options.request ?? (async () => ({ status: 200, body: { proposals: [] } })) } as unknown as ControlPanelDeps['client'];
  const host = registerControlPanel(context, { client, active, locator: {} as ControlPanelDeps['locator'] });
  host.createOrShow();
  return { posted, receive: async (message) => handler(message), publishState, host };
}

function flushLanding(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function navigateEvents(posted: readonly HostMessage[]): unknown[] {
  return posted.filter((message) => message.kind === 'event' && message.event === 'navigate').map((message) => (message as { payload: unknown }).payload);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('WorkspaceControlPanel first-visit gate navigation', () => {
  it('firstState_shouldDeliverGateNavOnReady_whenStateArrivesBeforeWebviewIsReady', async () => {
    const harness = openPanel();

    harness.publishState(GATE_STATE);
    expect(navigateEvents(harness.posted)).toEqual([]);
    await harness.receive({ kind: 'ready', protocol: PROTOCOL_VERSION });

    expect(navigateEvents(harness.posted)).toEqual([{ tab: 'progress', anchor: 'ship-summary' }]);
  });

  it('firstState_shouldPostGateNavImmediately_whenWebviewIsAlreadyReady', async () => {
    const harness = openPanel();

    await harness.receive({ kind: 'ready', protocol: PROTOCOL_VERSION });
    harness.publishState(GATE_STATE);
    await flushLanding();

    expect(navigateEvents(harness.posted)).toEqual([{ tab: 'progress', anchor: 'ship-summary' }]);
  });

  it('firstState_shouldNotNavigate_whenNoGateIsWaiting', async () => {
    const harness = openPanel();

    harness.publishState(makeState({ phase: '3.1.0', pending_gate: null }));
    await harness.receive({ kind: 'ready', protocol: PROTOCOL_VERSION });

    expect(navigateEvents(harness.posted)).toEqual([]);
  });

  it('reveal_shouldCancelFirstVisitGateNav_whenExplicitTargetIsRequested', async () => {
    const harness = openPanel();

    harness.host.createOrShow({ tab: 'review' });
    harness.publishState(GATE_STATE);
    await harness.receive({ kind: 'ready', protocol: PROTOCOL_VERSION });

    expect(navigateEvents(harness.posted)).toEqual([{ tab: 'review' }]);
  });
});

describe('WorkspaceControlPanel first-visit needs-attention landing', () => {
  const PLAN = { description: 'Ship it', execution: [{ id: '3.1', name: 'Build', tasks: [] }] };
  const REFLECTION_STATE = makeState({ phase: '5.1', phase_sequence: ['5.1', '6'], pending_gate: null });

  it('firstState_shouldLandOnPlan_whenPlanWaitsForApprovalWithoutGate', async () => {
    const harness = openPanel();

    await harness.receive({ kind: 'ready', protocol: PROTOCOL_VERSION });
    harness.publishState(makeState({ phase: '2.0', plan: PLAN, plan_status: 'pending' }));
    await flushLanding();

    expect(navigateEvents(harness.posted)).toEqual([{ tab: 'planning', anchor: 'plan-execution' }]);
  });

  it('firstState_shouldLandOnReflection_whenProposalsWaitInReflectionPhase', async () => {
    const request = vi.fn(async () => ({ status: 200, body: { proposals: [{ status: 'proposed' }] } }));
    const harness = openPanel({ request });

    await harness.receive({ kind: 'ready', protocol: PROTOCOL_VERSION });
    harness.publishState(REFLECTION_STATE);
    await flushLanding();

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', path: '/api/ws/shop/feature/gate/proposals' }));
    expect(navigateEvents(harness.posted)).toEqual([{ tab: 'reflection', anchor: 'reflection-proposals' }]);
  });

  it('firstState_shouldNotNavigate_whenUserPicksTabBeforeProposalsLoad', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const harness = openPanel({ request: () => new Promise((resolve) => { answer = resolve; }) });
    await harness.receive({ kind: 'ready', protocol: PROTOCOL_VERSION });
    harness.publishState(REFLECTION_STATE);

    await harness.receive({ kind: 'request', id: 1, method: 'panel.rememberTab', params: { tab: 'review' } });
    answer({ status: 200, body: { proposals: [{ status: 'proposed' }] } });
    await flushLanding();

    expect(navigateEvents(harness.posted)).toEqual([]);
  });

  it('firstState_shouldLandOnTicketSummary_whenProposalsCannotBeReadOnFinishedTicket', async () => {
    const harness = openPanel({ request: async () => { throw new ApiError(500, 'server_error', 'boom'); } });

    await harness.receive({ kind: 'ready', protocol: PROTOCOL_VERSION });
    harness.publishState(makeState({ phase: '6', phase_sequence: ['5.1', '6'], pending_gate: null }));
    await flushLanding();

    expect(navigateEvents(harness.posted)).toEqual([{ tab: 'progress', anchor: 'progress-summary' }]);
  });

  it('firstState_shouldKeepRememberedTab_whenGateIsPending', async () => {
    const harness = openPanel({ rememberedTab: 'changes' });

    await harness.receive({ kind: 'ready', protocol: PROTOCOL_VERSION });
    harness.publishState(GATE_STATE);
    await flushLanding();

    expect(navigateEvents(harness.posted)).toEqual([]);
  });
});

describe('ReadyGatedNavigation', () => {
  it('request_shouldHoldOnlyLatestTarget_untilReady', () => {
    const post = vi.fn();
    const navigation = new ReadyGatedNavigation(post);

    navigation.request({ tab: 'planning' });
    navigation.request({ tab: 'phase', anchor: 'phase-progression' });
    expect(post).not.toHaveBeenCalled();
    navigation.markReady();

    expect(post.mock.calls).toEqual([[{ tab: 'phase', anchor: 'phase-progression' }]]);
  });

  it('markReady_shouldRedeliverLatestTarget_whenWebviewReloads', () => {
    const post = vi.fn();
    const navigation = new ReadyGatedNavigation(post);
    navigation.markReady();
    navigation.request({ tab: 'review' });

    navigation.markReady();

    expect(post.mock.calls).toEqual([[{ tab: 'review' }], [{ tab: 'review' }]]);
  });

  it('markReady_shouldRedeliverTabUserPicked_whenWebviewReloadsAfterIt', () => {
    const post = vi.fn();
    const navigation = new ReadyGatedNavigation(post);
    navigation.request({ tab: 'review' });
    navigation.markReady();
    navigation.recordShown({ tab: 'planning' });

    navigation.markReady();

    expect(post.mock.calls).toEqual([[{ tab: 'review' }], [{ tab: 'planning' }]]);
  });

  it('markReady_shouldPostNothing_whenNothingWasEverRequested', () => {
    const post = vi.fn();
    const navigation = new ReadyGatedNavigation(post);

    navigation.markReady();
    navigation.markReady();

    expect(post).not.toHaveBeenCalled();
  });

  it('request_shouldPostAtOnce_afterReady', () => {
    const post = vi.fn();
    const navigation = new ReadyGatedNavigation(post);

    navigation.markReady();
    navigation.request({ tab: 'review' });

    expect(post).toHaveBeenCalledWith({ tab: 'review' });
  });
});
