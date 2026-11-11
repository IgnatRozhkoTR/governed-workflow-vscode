export const PLAN_TARGET = 'plan';

export function subPhaseTarget(subPhaseId: string): string {
  return `subphase:${subPhaseId}`;
}

export function taskTarget(taskTitle: string): string {
  return `task:${taskTitle}`;
}
