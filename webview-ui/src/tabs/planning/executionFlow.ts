import type { Plan, PlanSubPhase, PlanTask } from '@api-types';
import { t } from '../../i18n/i18n';

export type FlowDirection = 'LR' | 'TD';

export interface FlowPalette {
  readonly done: string;
  readonly progress: string;
  readonly pending: string;
  readonly dot: string;
}

export const DARK_FLOW_PALETTE: FlowPalette = {
  done: 'fill:#2d4a2d,stroke:#6bc77a,color:#e8e6e1',
  progress: 'fill:#4a4a2d,stroke:#c7b76b,color:#e8e6e1',
  pending: 'fill:#2d3250,stroke:#4a5078,color:#f0ede8',
  dot: 'fill:#4a5078,stroke:#8888a0,color:#4a5078',
};

export const LIGHT_FLOW_PALETTE: FlowPalette = {
  done: 'fill:#d4edda,stroke:#2e8540,color:#1a1a18',
  progress: 'fill:#fff3cd,stroke:#b8860b,color:#1a1a18',
  pending: 'fill:#e8edf3,stroke:#c5cdd8,color:#1a1a18',
  dot: 'fill:#c5cdd8,stroke:#8b8fa3,color:#c5cdd8',
};

export interface ExecutionFlow {
  readonly source: string;
  readonly tooltips: Readonly<Record<string, string>>;
}

interface GroupMember {
  readonly task: PlanTask;
  readonly index: number;
}

const SUB_LABEL_MAX = 60;
const TASK_LABEL_MAX = 60;

export function escapeLabel(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function truncateLabel(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.substring(0, maxLength - 1)}…`;
}

export function groupTasks(tasks: readonly PlanTask[]): readonly (readonly GroupMember[])[] {
  const groups = new Map<string, GroupMember[]>();
  tasks.forEach((task, index) => {
    const key = task.group !== undefined && task.group !== '' ? task.group : `_solo_${index}`;
    const members = groups.get(key) ?? [];
    members.push({ task, index });
    groups.set(key, members);
  });
  return [...groups.values()];
}

function taskNodeId(subId: string, index: number): string {
  return `${subId}_T${index + 1}`;
}

class FlowBuilder {
  readonly lines: string[];
  readonly tooltips: Record<string, string> = {};
  private lastSubPhaseNodes: string[] = [];

  constructor(direction: FlowDirection, private readonly palette: FlowPalette) {
    this.lines = [`graph ${direction}`];
  }

  addSubPhase(item: PlanSubPhase, position: number, innerDirection: string): void {
    const subId = `S${position + 1}`;
    const fullName = item.name !== undefined && item.name !== '' ? item.name : t('phase.phaseName', { phase: position + 1 });
    const id = item.id;
    this.tooltips[subId] = `${id} — ${fullName}`;
    this.lines.push(`    subgraph ${subId}["${escapeLabel(id)} — ${escapeLabel(truncateLabel(fullName, SUB_LABEL_MAX))}"]`);
    this.lines.push(`    direction ${innerDirection}`);
    const tasks = item.tasks ?? [];
    if (tasks.length === 0) {
      this.addEmptySubPhase(subId);
      return;
    }
    const { entry, exit } = this.addGroups(subId, tasks);
    this.lines.push('    end');
    this.addTaskStyles(subId, tasks);
    this.connectFromPrevious([entry]);
    this.lastSubPhaseNodes = [exit];
  }

  private addEmptySubPhase(subId: string): void {
    const emptyId = `${subId}_empty`;
    this.lines.push(`        ${emptyId}["${escapeLabel(t('plan.noTasks'))}"]`);
    this.lines.push('    end');
    this.connectFromPrevious([emptyId]);
    this.lastSubPhaseNodes = [emptyId];
  }

  private connectFromPrevious(entries: readonly string[]): void {
    this.lastSubPhaseNodes.forEach((last) => entries.forEach((entry) => this.lines.push(`    ${last} --> ${entry}`)));
  }

  private addGroups(subId: string, tasks: readonly PlanTask[]): { entry: string; exit: string } {
    let entry: string | undefined;
    let exit: string | undefined;
    groupTasks(tasks).forEach((members, groupIndex) => {
      const group = this.addGroup(subId, groupIndex, members);
      if (exit !== undefined) {
        this.lines.push(`    ${exit} --> ${group.entry}`);
      }
      entry ??= group.entry;
      exit = group.exit;
    });
    return { entry: entry as string, exit: exit as string };
  }

  private addGroup(subId: string, groupIndex: number, members: readonly GroupMember[]): { entry: string; exit: string } {
    const ids = members.map((member) => taskNodeId(subId, member.index));
    members.forEach((member, position) => this.addTaskNode(ids[position] as string, member));
    if (members.length === 1) {
      return { entry: ids[0] as string, exit: ids[0] as string };
    }
    const forkId = `${subId}_G${groupIndex}_fork`;
    const joinId = `${subId}_G${groupIndex}_join`;
    this.lines.push(`        ${forkId}(( ))`, `        ${joinId}(( ))`);
    this.lines.push(`    style ${forkId} ${this.palette.dot}`, `    style ${joinId} ${this.palette.dot}`);
    ids.forEach((id) => this.lines.push(`        ${forkId} --> ${id}`, `        ${id} --> ${joinId}`));
    return { entry: forkId, exit: joinId };
  }

  private addTaskNode(id: string, member: GroupMember): void {
    const fullTitle = member.task.title !== '' ? member.task.title : t('plan.task', { n: member.index + 1 });
    const agent = member.task.agent !== undefined && member.task.agent !== '' ? member.task.agent : undefined;
    const agentLine = agent === undefined ? '' : `<br/>${escapeLabel(agent)}`;
    this.tooltips[id] = agent === undefined ? fullTitle : `${fullTitle} (${agent})`;
    this.lines.push(`        ${id}["${escapeLabel(truncateLabel(fullTitle, TASK_LABEL_MAX))}${agentLine}"]`);
  }

  private addTaskStyles(subId: string, tasks: readonly PlanTask[]): void {
    tasks.forEach((task, index) => {
      const style = this.styleFor(task.status);
      if (style !== undefined) {
        this.lines.push(`    style ${taskNodeId(subId, index)} ${style}`);
      }
    });
  }

  private styleFor(status: string | undefined): string | undefined {
    if (status === 'done') {
      return this.palette.done;
    }
    if (status === 'in_progress') {
      return this.palette.progress;
    }
    return status === undefined || status === '' || status === 'pending' ? this.palette.pending : undefined;
  }
}

export function buildExecutionFlowWithTooltips(plan: Plan, direction: FlowDirection, palette: FlowPalette = DARK_FLOW_PALETTE): ExecutionFlow {
  const items = plan.execution ?? [];
  if (items.length === 0) {
    return { source: '', tooltips: {} };
  }
  const builder = new FlowBuilder(direction, palette);
  const innerDirection = direction === 'TD' ? 'LR' : 'TB';
  items.forEach((item, position) => builder.addSubPhase(item, position, innerDirection));
  return { source: builder.lines.join('\n'), tooltips: builder.tooltips };
}

export function buildExecutionFlow(plan: Plan, direction: FlowDirection, palette: FlowPalette = DARK_FLOW_PALETTE): string {
  return buildExecutionFlowWithTooltips(plan, direction, palette).source;
}

export function matchesFlowNodeId(elementId: string, nodeId: string): boolean {
  const escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[-_])${escaped}(-\\d+)?$`).test(elementId);
}

export function applyFlowTooltips(svg: SVGSVGElement, tooltips: Readonly<Record<string, string>>): void {
  const elements = Array.from(svg.querySelectorAll('[id]'));
  Object.entries(tooltips).forEach(([nodeId, text]) => {
    const node = elements.find((element) => matchesFlowNodeId(element.getAttribute('id') ?? '', nodeId));
    if (node === undefined) {
      return;
    }
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = text;
    node.insertBefore(title, node.firstChild);
  });
}
