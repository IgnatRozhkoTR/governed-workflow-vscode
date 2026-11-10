import type { PlanSubPhase } from '@api-types';

export function isCurrentSubPhase(phase: string, subPhaseId: string): boolean {
  return subPhaseId !== '' && (phase === subPhaseId || phase.startsWith(`${subPhaseId}.`));
}

export function shouldCollapseSubPhase(phase: string, items: readonly PlanSubPhase[], item: PlanSubPhase): boolean {
  return items.some((candidate) => isCurrentSubPhase(phase, candidate.id)) && !isCurrentSubPhase(phase, item.id);
}
