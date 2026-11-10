import type { WorkspaceState } from '../api/types';
import { isApprovalBlocker } from '../comments/commentMapping';
import type { NavTarget } from '../shared/navigation';

export const PLAN_PENDING_CONTEXT_VALUE = 'gwPlanPending';
const PENDING_PLAN_STATUS = 'pending';
const NO_PLAN_STATUS = 'no plan';
const OPEN_DISCUSSION_STATUS = 'open';
const DONE_TASK_STATUS = 'done';
const REVIEW_COMMENT_KEY_PREFIX = 'review:';
const UNPROVEN_RESEARCH = 0;

export interface LauncherItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly icon: string;
  readonly nav: NavTarget;
  readonly contextValue?: string;
}

const STATIC_ITEMS: readonly LauncherItem[] = [
  { id: 'changes', label: 'Code changes', icon: 'git-compare', nav: { tab: 'changes' } },
  { id: 'reflection', label: 'Reflection', icon: 'lightbulb', nav: { tab: 'reflection' } },
  { id: 'scratchpads', label: 'Scratchpads', icon: 'notebook', nav: { tab: 'scratchpads' } },
  { id: 'settings', label: 'Settings', icon: 'settings-gear', nav: { tab: 'settings' } },
];

export function mapStateToLauncher(state: WorkspaceState): LauncherItem[] {
  return [
    phaseItem(state),
    ...gateItems(state),
    planItem(state),
    discussionsItem(state),
    researchItem(state),
    reviewItem(state),
    progressItem(state),
    ...STATIC_ITEMS,
  ];
}

// The approve and reject buttons follow the plan status alone, so a plan re-submitted mid-execution (e.g. at 4.1) is still actionable.
export function isPlanPending(state: WorkspaceState): boolean {
  return state.plan_status === PENDING_PLAN_STATUS && (state.plan.execution?.length ?? 0) > 0;
}

function phaseItem(state: WorkspaceState): LauncherItem {
  return { id: 'phase', label: 'Phase', description: `${state.phase} · ${state.status}`, icon: 'milestone', nav: { tab: 'phase' } };
}

function gateItems(state: WorkspaceState): LauncherItem[] {
  const gate = state.pending_gate;
  if (gate === null || gate === undefined) {
    return [];
  }
  return [{ id: 'gate', label: 'Gate waiting', description: gate.phase, icon: 'shield', nav: { tab: 'phase' } }];
}

function planItem(state: WorkspaceState): LauncherItem {
  const tasks = (state.plan.execution ?? []).flatMap((subPhase) => subPhase.tasks ?? []);
  const doneCount = tasks.filter((task) => task.status === DONE_TASK_STATUS).length;
  return {
    id: 'plan',
    label: 'Plan',
    description: `${state.plan_status ?? NO_PLAN_STATUS} · ${doneCount}/${tasks.length} tasks`,
    icon: 'checklist',
    nav: { tab: 'planning' },
    contextValue: isPlanPending(state) ? PLAN_PENDING_CONTEXT_VALUE : undefined,
  };
}

function discussionsItem(state: WorkspaceState): LauncherItem {
  const openCount = state.discussions.filter((discussion) => discussion.status === OPEN_DISCUSSION_STATUS).length;
  return {
    id: 'discussions',
    label: 'Discussions',
    description: `${openCount}/${state.discussions.length} open`,
    icon: 'comment-discussion',
    nav: { tab: 'preplanning' },
  };
}

function researchItem(state: WorkspaceState): LauncherItem {
  const unprovenCount = state.research.filter((entry) => entry.proven === UNPROVEN_RESEARCH).length;
  const unproven = unprovenCount > 0 ? ` (${unprovenCount} unproven)` : '';
  return { id: 'research', label: 'Research', description: `${state.research.length}${unproven}`, icon: 'search', nav: { tab: 'research' } };
}

function reviewItem(state: WorkspaceState): LauncherItem {
  const openCount = Object.entries(state.comments)
    .filter(([key]) => key.startsWith(REVIEW_COMMENT_KEY_PREFIX))
    .reduce((sum, [, roots]) => sum + roots.filter(isApprovalBlocker).length, 0);
  return { id: 'review', label: 'Review threads', description: `${openCount} open`, icon: 'comment', nav: { tab: 'review' } };
}

function progressItem(state: WorkspaceState): LauncherItem {
  const entryCount = Object.keys(state.progress).length;
  return { id: 'progress', label: 'Progress', description: `${entryCount} entries`, icon: 'pulse', nav: { tab: 'progress' } };
}
