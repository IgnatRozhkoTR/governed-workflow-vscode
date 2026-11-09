import type { Discussion, PlanSubPhase, ResearchEntry, ReviewComment, WorkspaceState } from '../api/types';

export interface Node {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly markdown?: string;
}

export interface Section {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly children: Node[];
}

const STATUS_OPEN = 'open';
const EMPTY_VALUE = '-';

export function mapStateToSections(state: WorkspaceState): Section[] {
  return [
    phaseSection(state),
    planSection(state),
    progressSection(state),
    researchSection(state),
    discussionsSection(state),
    commentsSection(state),
  ];
}

export function formatDetails(details: unknown): string {
  if (details === undefined || details === null) {
    return '';
  }
  return typeof details === 'string' ? details : `\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``;
}

function phaseSection(state: WorkspaceState): Section {
  const gate = state.pending_gate;
  const children: Node[] = [
    { id: 'phase.phase', label: 'Phase', description: state.phase },
    { id: 'phase.status', label: 'Status', description: state.status },
    { id: 'phase.planStatus', label: 'Plan status', description: state.plan_status ?? EMPTY_VALUE },
    { id: 'phase.workflowMode', label: 'Workflow mode', description: state.workflow_mode },
    { id: 'phase.yolo', label: 'YOLO mode', description: state.yolo_mode ? 'on' : 'off' },
    { id: 'phase.gate', label: 'Pending gate', description: gate ? gate.phase : 'none' },
  ];
  return { id: 'phase', label: 'Phase', description: state.phase, children };
}

function planSection(state: WorkspaceState): Section {
  const children = (state.plan.execution ?? []).flatMap(planNodes);
  const markdown = state.plan.description;
  const header = markdown ? [{ id: 'plan.description', label: 'Description', markdown }] : [];
  return { id: 'plan', label: 'Plan', description: state.plan_status ?? undefined, children: [...header, ...children] };
}

function planNodes(subPhase: PlanSubPhase): Node[] {
  const heading: Node = { id: `plan.${subPhase.id}`, label: subPhase.name ?? subPhase.id, description: subPhase.id };
  const tasks = (subPhase.tasks ?? []).map((task, index) => ({
    id: `plan.${subPhase.id}.task.${index}`,
    label: task.title,
    description: task.status ?? 'pending',
    markdown: task.description ? `# ${task.title}\n\n${task.description}` : undefined,
  }));
  return [heading, ...tasks];
}

function progressSection(state: WorkspaceState): Section {
  const children = Object.entries(state.progress).map(([phase, entry]) => ({
    id: `progress.${phase}`,
    label: phase,
    description: entry.summary,
    markdown: `# ${phase}\n\n${entry.summary}\n\n${formatDetails(entry.details)}`,
  }));
  return { id: 'progress', label: 'Progress', children };
}

function researchSection(state: WorkspaceState): Section {
  return { id: 'research', label: 'Research', children: state.research.map(researchNode) };
}

function researchNode(entry: ResearchEntry): Node {
  const notes = entry.proven_notes ? `\n\n**Proof notes:** ${entry.proven_notes}` : '';
  return {
    id: `research.${entry.id}`,
    label: entry.topic,
    description: entry.proven ? 'proven' : 'unproven',
    markdown: `# ${entry.topic}\n\n${entry.summary}\n\n${formatDetails(entry.findings)}${notes}`,
  };
}

function discussionsSection(state: WorkspaceState): Section {
  const open = state.discussions.filter((discussion) => discussion.status === STATUS_OPEN);
  const children = state.discussions.map(discussionNode);
  return { id: 'discussions', label: 'Discussions', description: `${open.length} open`, children };
}

function discussionNode(discussion: Discussion): Node {
  const replies = discussion.replies.map((reply) => `- **${reply.author}**: ${reply.text}`).join('\n');
  return {
    id: `discussion.${discussion.id}`,
    label: firstLine(discussion.text),
    description: discussion.status,
    markdown: `# Discussion ${discussion.id}\n\n**${discussion.author}**: ${discussion.text}\n\n${replies}`,
  };
}

function commentsSection(state: WorkspaceState): Section {
  const groups = Object.entries(state.comments);
  const openCount = groups.reduce((sum, [, comments]) => sum + comments.filter(isOpenComment).length, 0);
  const children = groups.map(([key, comments]) => commentGroupNode(key, comments));
  return { id: 'comments', label: 'Comments', description: `${openCount} open`, children };
}

function commentGroupNode(key: string, comments: ReviewComment[]): Node {
  const lines = comments.map((comment) => `- ${comment.resolved ? '[resolved]' : '[open]'} **${comment.author}**: ${comment.text}`);
  return {
    id: `comments.${key}`,
    label: key,
    description: `${comments.filter(isOpenComment).length} open`,
    markdown: `# ${key}\n\n${lines.join('\n')}`,
  };
}

function isOpenComment(comment: ReviewComment): boolean {
  return !comment.resolved;
}

function firstLine(text: string): string {
  return text.split('\n', 1)[0];
}
