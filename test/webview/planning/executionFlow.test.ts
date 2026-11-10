import type { Plan } from '@api-types';
import { describe, expect, it } from 'vitest';
import {
  buildExecutionFlow, buildExecutionFlowWithTooltips, groupTasks, LIGHT_FLOW_PALETTE, matchesFlowNodeId, truncateLabel,
} from '../../../webview-ui/src/tabs/planning/executionFlow';

const PLAN: Plan = {
  execution: [
    {
      id: '3.1',
      name: 'Backend',
      tasks: [
        { title: 'Schema', agent: 'dev', status: 'done' },
        { title: 'Service', group: 'par', status: 'in_progress' },
        { title: 'Controller', group: 'par' },
        { title: 'Wire up', status: 'pending' },
      ],
    },
    { id: '3.2', name: 'Frontend', tasks: [{ title: 'Page' }] },
  ],
};

describe('buildExecutionFlow', () => {
  it('returns an empty string when the plan has no sub-phases', () => {
    expect(buildExecutionFlow({}, 'LR')).toBe('');
    expect(buildExecutionFlow({ execution: [] }, 'TD')).toBe('');
  });

  it('starts with the graph direction and uses TB inside sub-phases for LR', () => {
    const lines = buildExecutionFlow(PLAN, 'LR').split('\n');
    expect(lines[0]).toBe('graph LR');
    expect(lines).toContain('    direction TB');
  });

  it('uses LR inside sub-phases for TD', () => {
    const source = buildExecutionFlow(PLAN, 'TD');
    expect(source.split('\n')[0]).toBe('graph TD');
    expect(source).toContain('    direction LR');
  });

  it('emits one subgraph per sub-phase with id and truncated name', () => {
    const source = buildExecutionFlow(PLAN, 'LR');
    expect(source).toContain('subgraph S1["3.1 — Backend"]');
    expect(source).toContain('subgraph S2["3.2 — Frontend"]');
  });

  it('chains sequential tasks and forks parallel groups', () => {
    const lines = buildExecutionFlow(PLAN, 'LR').split('\n').map((line) => line.trim());
    expect(lines).toContain('S1_T1 --> S1_G1_fork');
    expect(lines).toContain('S1_G1_fork --> S1_T2');
    expect(lines).toContain('S1_G1_fork --> S1_T3');
    expect(lines).toContain('S1_T2 --> S1_G1_join');
    expect(lines).toContain('S1_T3 --> S1_G1_join');
    expect(lines).toContain('S1_G1_join --> S1_T4');
  });

  it('connects the last node of a sub-phase to the first node of the next, after the subgraph closes', () => {
    const lines = buildExecutionFlow(PLAN, 'LR').split('\n').map((line) => line.trim());
    const edge = lines.indexOf('S1_T4 --> S2_T1');
    expect(edge).toBeGreaterThan(lines.indexOf('end'));
  });

  it('styles tasks by status with the chosen palette', () => {
    const dark = buildExecutionFlow(PLAN, 'LR');
    expect(dark).toContain('style S1_T1 fill:#2d4a2d');
    expect(dark).toContain('style S1_T2 fill:#4a4a2d');
    expect(dark).toContain('style S1_T4 fill:#2d3250');
    const light = buildExecutionFlow(PLAN, 'LR', LIGHT_FLOW_PALETTE);
    expect(light).toContain('style S1_T1 fill:#d4edda');
  });

  it('does not style tasks with an unknown status', () => {
    const source = buildExecutionFlow({ execution: [{ id: '3.1', tasks: [{ title: 'x', status: 'failed' }] }] }, 'LR');
    expect(source).not.toContain('style S1_T1');
  });

  it('renders an empty sub-phase as a placeholder node linked to the previous one', () => {
    const plan: Plan = { execution: [{ id: '3.1', tasks: [{ title: 'a' }] }, { id: '3.2', name: 'Empty', tasks: [] }] };
    const lines = buildExecutionFlow(plan, 'LR').split('\n').map((line) => line.trim());
    expect(lines).toContain('S2_empty["plan.noTasks"]');
    expect(lines).toContain('S1_T1 --> S2_empty');
  });

  it('puts the agent on a second label line and escapes quotes and angle brackets', () => {
    const plan: Plan = { execution: [{ id: '3.1', tasks: [{ title: 'Say "hi" <b>', agent: 'dev' }] }] };
    expect(buildExecutionFlow(plan, 'LR')).toContain('S1_T1["Say &quot;hi&quot; &lt;b&gt;<br/>dev"]');
  });
});

describe('buildExecutionFlowWithTooltips', () => {
  it('returns full names for truncated labels', () => {
    const longName = 'A very long sub-phase name that is truncated '.repeat(2);
    const longTitle = 'An extremely long task title that will not fit '.repeat(2);
    const plan: Plan = { execution: [{ id: '3.1', name: longName, tasks: [{ title: longTitle, agent: 'dev' }] }] };
    const { source, tooltips } = buildExecutionFlowWithTooltips(plan, 'LR');
    expect(source).toContain('…');
    expect(tooltips.S1).toBe(`3.1 — ${longName}`);
    expect(tooltips.S1_T1).toBe(`${longTitle} (dev)`);
  });
});

describe('helpers', () => {
  it('groups tasks sharing a group name and keeps solo tasks apart', () => {
    const groups = groupTasks([{ title: 'a', group: 'g' }, { title: 'b' }, { title: 'c', group: 'g' }]);
    expect(groups.map((members) => members.map((member) => member.index))).toEqual([[0, 2], [1]]);
  });

  it('truncates with an ellipsis only when longer than the limit', () => {
    expect(truncateLabel('abcdef', 6)).toBe('abcdef');
    expect(truncateLabel('abcdefg', 6)).toBe('abcde…');
  });

  it('matches mermaid element ids with prefixes and numeric suffixes but not partial names', () => {
    expect(matchesFlowNodeId('flowchart-S1_T1-5', 'S1_T1')).toBe(true);
    expect(matchesFlowNodeId('gwm1_S1', 'S1')).toBe(true);
    expect(matchesFlowNodeId('gwm1_flowchart-S1_T1-5', 'S1')).toBe(false);
    expect(matchesFlowNodeId('flowchart-S11_T1-5', 'S1_T1')).toBe(false);
  });
});
