import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { WorkspaceRef, WorkspaceState } from '../src/api/types';
import type { ActiveWorkspace } from '../src/state/activeWorkspace';
import { registerWorkspaceIndicators } from '../src/views/workspaceIndicators';
import { makeState } from './support/fixtures';
import { EventEmitter, statusBarItems, type FakeStatusBarItem } from './vscodeStub';

const REF: WorkspaceRef = { projectId: 'p', branch: 'b' };
const PENDING_PLAN = { plan_status: 'pending', plan: { execution: [{ id: '4.1', tasks: [{ title: 't' }] }] } } as const;

class FakeActive {
  ref: WorkspaceRef | undefined;
  state: WorkspaceState | undefined;
  readonly changes = new EventEmitter<WorkspaceRef | undefined>();
  readonly stateChanges = new EventEmitter<WorkspaceState>();
  readonly onDidChange = this.changes.event;
  readonly onDidChangeState = this.stateChanges.event;
}

let active: FakeActive;
let subscriptions: { dispose(): void }[];

function contextCalls(): Record<string, boolean> {
  const calls = vi.mocked(vscode.commands.executeCommand).mock.calls;
  return Object.fromEntries(calls.filter(([command]) => command === 'setContext').map(([, key, value]) => [key as string, value as boolean]));
}

function register(): FakeStatusBarItem {
  registerWorkspaceIndicators({ subscriptions } as unknown as vscode.ExtensionContext, active as unknown as ActiveWorkspace);
  return statusBarItems[statusBarItems.length - 1];
}

beforeEach(() => {
  vi.mocked(vscode.commands.executeCommand).mockReset();
  statusBarItems.length = 0;
  subscriptions = [];
  active = new FakeActive();
});

describe('registerWorkspaceIndicators', () => {
  it('update_shouldClearAllContextKeysAndHideItem_whenNoWorkspaceIsSelected', () => {
    const item = register();

    expect(contextCalls()).toEqual({
      'governedWorkflow.hasWorkspace': false,
      'governedWorkflow.yolo': false,
      'governedWorkflow.planPending': false,
    });
    expect(item.isVisible).toBe(false);
  });

  it('update_shouldSetHasWorkspace_whenWorkspaceIsSelected', () => {
    active.ref = REF;
    active.state = makeState();

    register();

    expect(contextCalls()['governedWorkflow.hasWorkspace']).toBe(true);
  });

  it('update_shouldSetYoloKey_whenStateHasYoloMode', () => {
    active.ref = REF;
    active.state = makeState({ yolo_mode: true });

    register();

    expect(contextCalls()['governedWorkflow.yolo']).toBe(true);
  });

  it('update_shouldShowPlanItemAndSetKey_whenPlanIsPending', () => {
    active.ref = REF;
    active.state = makeState(PENDING_PLAN);

    const item = register();

    expect(contextCalls()['governedWorkflow.planPending']).toBe(true);
    expect(item.isVisible).toBe(true);
    expect(item.text).toBe('$(checklist) Plan: pending');
    expect(item.command).toBe('governedWorkflow.openPlan');
  });

  it('onDidChangeState_shouldHideItem_whenPlanGetsApproved', () => {
    active.ref = REF;
    active.state = makeState(PENDING_PLAN);
    const item = register();

    active.state = makeState({ plan_status: 'approved' });
    active.stateChanges.fire(active.state);

    expect(item.isVisible).toBe(false);
    expect(contextCalls()['governedWorkflow.planPending']).toBe(false);
  });

  it('onDidChange_shouldRefreshKeys_whenWorkspaceSwitches', () => {
    register();

    active.ref = REF;
    active.state = makeState({ yolo_mode: true });
    active.changes.fire(REF);

    expect(contextCalls()).toMatchObject({ 'governedWorkflow.hasWorkspace': true, 'governedWorkflow.yolo': true });
  });

  it('dispose_shouldDisposeStatusItem_whenSubscriptionsAreDisposed', () => {
    const item = register();

    subscriptions.forEach((subscription) => subscription.dispose());

    expect(item.isDisposed).toBe(true);
  });
});
