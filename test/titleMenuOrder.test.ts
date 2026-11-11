import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface MenuEntry {
  command: string;
  when: string;
  group: string;
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const WORKSPACE_VIEW = 'view == governedWorkflow.state';

function groupOf(command: string): string {
  const entry = (manifest.contributes.menus['view/title'] as MenuEntry[]).find(
    (candidate) => candidate.command === command && candidate.when.startsWith(WORKSPACE_VIEW),
  );
  if (entry === undefined) {
    throw new Error(`missing title entry ${command}`);
  }
  return entry.group;
}

function navigationRank(command: string): number {
  const [group, order] = groupOf(command).split('@');
  expect(group).toBe('navigation');
  return Number(order);
}

describe('workspace view title bar', () => {
  it('titleBar_shouldOrderByFrequencyOfUse', () => {
    const commands = [
      'openControlPanel',
      'notifyClaude',
      'refresh',
      'approvePlan',
      'rejectPlan',
      'approveGate',
      'rejectGate',
    ].map((name) => `governedWorkflow.${name}`);

    const ranks = commands.map(navigationRank);

    expect(ranks).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('titleBar_shouldKeepYoloToggleInTheLastOverflowGroup', () => {
    const overflowGroups = ['switchWorkspace', 'setPhase', 'attachImage', 'terminalSessions'].map((name) =>
      groupOf(`governedWorkflow.${name}`),
    );

    expect(groupOf('governedWorkflow.toggleYolo')).toBe('3_rare@1');
    expect(groupOf('governedWorkflow.disableYolo')).toBe('3_rare@1');
    expect(overflowGroups.every((group) => group < '3_rare')).toBe(true);
  });
});
