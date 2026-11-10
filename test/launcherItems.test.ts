import { describe, expect, it } from 'vitest';
import type { PlanSubPhase } from '../src/api/types';
import { isPlanPending, mapStateToLauncher, PLAN_PENDING_CONTEXT_VALUE, type LauncherItem } from '../src/views/launcherItems';
import { makeComment, makeState } from './support/fixtures';

const EXECUTION: PlanSubPhase[] = [
  { id: '4.1', tasks: [{ title: 'a', status: 'done' }, { title: 'b', status: 'pending' }] },
  { id: '4.2', tasks: [{ title: 'c', status: 'done' }] },
  { id: '4.3' },
];

function itemById(items: LauncherItem[], id: string): LauncherItem {
  const item = items.find((entry) => entry.id === id);
  if (item === undefined) {
    throw new Error(`missing launcher item ${id}`);
  }
  return item;
}

describe('mapStateToLauncher', () => {
  it('mapStateToLauncher_shouldReturnRowsInFixedOrder_whenNoGateIsPending', () => {
    const ids = mapStateToLauncher(makeState()).map((item) => item.id);

    expect(ids).toEqual(['phase', 'plan', 'discussions', 'research', 'review', 'progress', 'changes', 'reflection', 'scratchpads', 'settings']);
  });

  it('mapStateToLauncher_shouldInsertGateRowAfterPhase_whenGateIsPending', () => {
    const state = makeState({ phase: '4.1', pending_gate: { phase: '4.1', accepts_commit_message: true } });

    const items = mapStateToLauncher(state);

    expect(items.slice(0, 2).map((item) => item.id)).toEqual(['phase', 'gate']);
    expect(itemById(items, 'gate')).toMatchObject({ description: '4.1', nav: { tab: 'phase' } });
  });

  it('mapStateToLauncher_shouldDescribePhaseWithStatus', () => {
    const items = mapStateToLauncher(makeState({ phase: '4.1', status: 'in_progress' }));

    expect(itemById(items, 'phase').description).toBe('4.1 · in_progress');
  });

  it('mapStateToLauncher_shouldCountDoneTasksAcrossSubPhases_whenPlanHasExecution', () => {
    const items = mapStateToLauncher(makeState({ phase: '4.1', plan_status: 'approved', plan: { execution: EXECUTION } }));

    expect(itemById(items, 'plan')).toMatchObject({ description: 'approved · 2/3 tasks', nav: { tab: 'planning' } });
  });

  it('mapStateToLauncher_shouldShowNoPlanAndZeroTasks_whenPlanIsAbsent', () => {
    const items = mapStateToLauncher(makeState());

    expect(itemById(items, 'plan').description).toBe('no plan · 0/0 tasks');
  });

  it('mapStateToLauncher_shouldMarkPlanRowPending_whenPlanAwaitsApprovalAtPhase41', () => {
    const state = makeState({ phase: '4.1', plan_status: 'pending', plan: { execution: EXECUTION } });

    expect(itemById(mapStateToLauncher(state), 'plan').contextValue).toBe(PLAN_PENDING_CONTEXT_VALUE);
  });

  it('mapStateToLauncher_shouldNotMarkPlanRowPending_whenPlanIsApproved', () => {
    const state = makeState({ plan_status: 'approved', plan: { execution: EXECUTION } });

    expect(itemById(mapStateToLauncher(state), 'plan').contextValue).toBeUndefined();
  });

  it('mapStateToLauncher_shouldCountOpenDiscussions', () => {
    const discussion = { id: 1, parent_id: null, text: '', author: 'a', type: null, hidden: null, created_at: '', resolved_at: null, replies: [] };
    const state = makeState({
      discussions: [{ ...discussion, status: 'open' }, { ...discussion, id: 2, status: 'resolved' }, { ...discussion, id: 3, status: 'open' }],
    });

    expect(itemById(mapStateToLauncher(state), 'discussions')).toMatchObject({ description: '2/3 open', nav: { tab: 'preplanning' } });
  });

  it('mapStateToLauncher_shouldReportUnprovenResearch_whenSomeEntriesAreUnproven', () => {
    const entry = { topic: '', summary: '', findings: null, proven_notes: null, discussion_id: null, created_at: '' };
    const state = makeState({ research: [{ ...entry, id: 1, proven: 0 }, { ...entry, id: 2, proven: 1 }] });

    expect(itemById(mapStateToLauncher(state), 'research')).toMatchObject({ description: '2 (1 unproven)', nav: { tab: 'research' } });
  });

  it('mapStateToLauncher_shouldOmitUnprovenSuffix_whenAllResearchIsProven', () => {
    const entry = { topic: '', summary: '', findings: null, proven_notes: null, discussion_id: null, created_at: '', proven: 1 };

    expect(itemById(mapStateToLauncher(makeState({ research: [{ ...entry, id: 1 }] })), 'research').description).toBe('1');
  });

  it('mapStateToLauncher_shouldCountReviewThreadsWithTheApproveGuardRule', () => {
    const state = makeState({
      comments: {
        'review:a.ts': [makeComment({ id: 1, resolution: 'open' }), makeComment({ id: 2, resolved: true, resolution: 'fixed' })],
        'review:b.ts': [makeComment({ id: 3, resolved: true, resolution: 'open' }), makeComment({ id: 5, resolution: 'false_positive' })],
        'plan:Entire plan': [makeComment({ id: 4, resolution: 'open' })],
      },
    });

    expect(itemById(mapStateToLauncher(state), 'review')).toMatchObject({ description: '2 open', nav: { tab: 'review' } });
  });

  it('mapStateToLauncher_shouldCountProgressEntries', () => {
    const entry = { summary: '', created_at: '', updated_at: '' };

    expect(itemById(mapStateToLauncher(makeState({ progress: { a: entry, b: entry } })), 'progress')).toMatchObject({
      description: '2 entries',
      nav: { tab: 'progress' },
    });
  });

  it('mapStateToLauncher_shouldTargetTabsForStaticRows', () => {
    const items = mapStateToLauncher(makeState());

    expect(['changes', 'reflection', 'scratchpads', 'settings'].map((id) => itemById(items, id).nav.tab)).toEqual([
      'changes', 'reflection', 'scratchpads', 'settings',
    ]);
  });
});

describe('isPlanPending', () => {
  it('isPlanPending_shouldBeTrue_whenStatusIsPendingAndPlanHasExecution', () => {
    expect(isPlanPending(makeState({ plan_status: 'pending', plan: { execution: EXECUTION } }))).toBe(true);
  });

  it('isPlanPending_shouldBeFalse_whenExecutionIsEmpty', () => {
    expect(isPlanPending(makeState({ plan_status: 'pending', plan: { execution: [] } }))).toBe(false);
  });

  it('isPlanPending_shouldBeFalse_whenPlanHasNoExecution', () => {
    expect(isPlanPending(makeState({ plan_status: 'pending' }))).toBe(false);
  });

  it('isPlanPending_shouldBeFalse_whenStatusIsNotPending', () => {
    expect(isPlanPending(makeState({ plan_status: 'approved', plan: { execution: EXECUTION } }))).toBe(false);
  });
});
