import type { Plan } from '@api-types';

const COMMIT_APPROVAL_PATTERN = /^(3\.\d+)\.3$/;

// The sub-phase being committed, as the plan names it: its name as the subject and its tasks as the body. Empty when
// the plan does not name it, so the agent writes the message itself.
export function suggestedCommitMessage(plan: Plan, gatePhase: string): string {
  const subPhaseId = COMMIT_APPROVAL_PATTERN.exec(gatePhase)?.[1];
  const subPhase = plan.execution?.find((entry) => entry.id === subPhaseId);
  const subject = subPhase?.name?.trim() ?? '';
  if (subject === '') {
    return '';
  }
  const tasks = (subPhase?.tasks ?? []).map((task) => task.title.trim()).filter((title) => title !== '');
  return tasks.length === 0 ? subject : `${subject}\n\n${tasks.map((title) => `- ${title}`).join('\n')}`;
}
