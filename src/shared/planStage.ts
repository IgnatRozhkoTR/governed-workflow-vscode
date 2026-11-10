import type { Plan } from '../api/types';

export type PlanStage = 'planning' | 'execution' | 'post_execution';

const FIRST_EXECUTION_PHASE = 3;
const FIRST_POST_EXECUTION_PHASE = 5;
const PENDING_PLAN_STATUS = 'pending';

// The state payload carries phase ids but no phase kind, so the plan's stage follows the workflow's fixed
// top-level numbering, as the web's Phase Control card does: phases 1-2 draft and approve the plan,
// phases 3-4 execute and review it, and from phase 5 on the plan decision is history.
export function planStageOf(phase: string): PlanStage {
  const topPhase = Number.parseInt(phase, 10);
  if (topPhase >= FIRST_POST_EXECUTION_PHASE) {
    return 'post_execution';
  }
  return topPhase >= FIRST_EXECUTION_PHASE ? 'execution' : 'planning';
}

export function isPlanPresent(plan: Plan | undefined): boolean {
  return (plan?.execution ?? []).length > 0 || (plan?.description ?? '') !== '';
}

// A plan without a recorded status has never been decided, so it waits for the user like an explicit "pending".
export function isPlanAwaitingApproval(plan: Plan | undefined, phase: string, planStatus: string | null): boolean {
  const isUndecided = planStatus === null || planStatus === PENDING_PLAN_STATUS;
  return isUndecided && isPlanPresent(plan) && planStageOf(phase) === 'planning';
}
