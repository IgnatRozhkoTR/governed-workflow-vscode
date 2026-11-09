import { describe, expect, it } from 'vitest';
import type { ReviewComment, WorkspaceState } from '../src/api/types';
import { formatDetails, mapStateToSections, type Section } from '../src/state/stateSections';

function state(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    workspace_id: 1,
    phase: '3.1',
    status: 'active',
    scope: {},
    plan: {},
    plan_status: null,
    phase_sequence: [],
    enabled_phases: [],
    workflow_mode: 'standard',
    review_mode: 'manual',
    locale: 'en',
    session_id: null,
    working_dir: '/w',
    branch: 'feature/x',
    source_branch: null,
    project_type: 'java',
    claude_command: 'claude',
    skip_permissions: false,
    restrict_to_workspace: true,
    allowed_external_paths: '',
    comments: {},
    research: [],
    discussions: [],
    phaseHistory: [],
    progress: {},
    sessions: [],
    impact_analysis: null,
    yolo_mode: false,
    pending_gate: null,
    ...overrides,
  } as WorkspaceState;
}

function section(sections: Section[], id: string): Section {
  const found = sections.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`missing section ${id}`);
  }
  return found;
}

function reviewComment(id: number, resolved: boolean): ReviewComment {
  return {
    id, parent_id: null, scope: 'review', target: 't', file_path: null, line_start: null, line_end: null,
    line_hash: null, text: `c${id}`, author: 'user', type: null, created_at: 't', resolved, resolved_at: null, resolution: null,
  };
}

describe('mapStateToSections', () => {
  it('should return the six sections in display order when mapping any state', () => {
    const sections = mapStateToSections(state());

    expect(sections.map((entry) => entry.id)).toEqual(['phase', 'plan', 'progress', 'research', 'discussions', 'comments']);
  });

  it('should show the phase from the payload when mapping the phase section', () => {
    const phase = section(mapStateToSections(state({ phase: '5.2' })), 'phase');

    expect(phase.description).toBe('5.2');
    expect(phase.children.find((node) => node.id === 'phase.phase')?.description).toBe('5.2');
  });

  it('should show none for the gate when pending_gate is null', () => {
    const phase = section(mapStateToSections(state({ pending_gate: null })), 'phase');

    expect(phase.children.find((node) => node.id === 'phase.gate')?.description).toBe('none');
  });

  it('should show the gate phase when pending_gate is set', () => {
    const gate = { phase: '4.0', accepts_commit_message: true };

    const phase = section(mapStateToSections(state({ pending_gate: gate })), 'phase');

    expect(phase.children.find((node) => node.id === 'phase.gate')?.description).toBe('4.0');
  });

  it('should show a dash for the plan status when plan_status is null', () => {
    const phase = section(mapStateToSections(state({ plan_status: null })), 'phase');

    expect(phase.children.find((node) => node.id === 'phase.planStatus')?.description).toBe('-');
  });

  it('should show YOLO mode as on when yolo_mode is true', () => {
    const phase = section(mapStateToSections(state({ yolo_mode: true })), 'phase');

    expect(phase.children.find((node) => node.id === 'phase.yolo')?.description).toBe('on');
  });

  it('should produce an empty plan section when the plan has no execution or description', () => {
    const plan = section(mapStateToSections(state({ plan: {} })), 'plan');

    expect(plan.children).toEqual([]);
  });

  it('should list sub-phase headings then their tasks when the plan has execution', () => {
    const plan = section(
      mapStateToSections(
        state({
          plan: {
            description: 'Goal',
            execution: [{ id: '3.1', name: 'Build', tasks: [{ title: 'Do it', description: 'Details' }, { title: 'Bare', status: 'done' }] }],
          },
        }),
      ),
      'plan',
    );

    expect(plan.children.map((node) => node.id)).toEqual(['plan.description', 'plan.3.1', 'plan.3.1.task.0', 'plan.3.1.task.1']);
    expect(plan.children[2]).toMatchObject({ label: 'Do it', description: 'pending', markdown: '# Do it\n\nDetails' });
    expect(plan.children[3]).toMatchObject({ description: 'done', markdown: undefined });
  });

  it('should label a sub-phase with its id when it has no name', () => {
    const plan = section(mapStateToSections(state({ plan: { execution: [{ id: '3.2' }] } })), 'plan');

    expect(plan.children).toEqual([{ id: 'plan.3.2', label: '3.2', description: '3.2' }]);
  });

  it('should key progress nodes by phase when progress has entries', () => {
    const entry = { summary: 'Done', created_at: 't', updated_at: 't', details: { a: 1 } };

    const progress = section(mapStateToSections(state({ progress: { '2.0': entry } })), 'progress');

    expect(progress.children).toHaveLength(1);
    expect(progress.children[0]).toMatchObject({ id: 'progress.2.0', label: '2.0', description: 'Done' });
    expect(progress.children[0].markdown).toContain('"a": 1');
  });

  it('should have no progress children when progress is empty', () => {
    expect(section(mapStateToSections(state()), 'progress').children).toEqual([]);
  });

  it('should group comments by their scope:target key and count open ones when mapping comments', () => {
    const comments = { 'review:src/a.ts': [reviewComment(1, false), reviewComment(2, true)], 'plan:3.1': [reviewComment(3, false)] };

    const section_ = section(mapStateToSections(state({ comments })), 'comments');

    expect(section_.description).toBe('2 open');
    expect(section_.children.map((node) => [node.label, node.description])).toEqual([
      ['review:src/a.ts', '1 open'],
      ['plan:3.1', '1 open'],
    ]);
    expect(section_.children[0].markdown).toContain('[resolved]');
  });

  it('should count only open discussions in the description when discussions have mixed status', () => {
    const replies = [{ author: 'claude', text: 'hi' }];
    const discussions = [
      { id: 1, status: 'open', text: 'first line\nsecond', author: 'user', replies },
      { id: 2, status: 'resolved', text: 'done', author: 'user', replies: [] },
    ] as unknown as WorkspaceState['discussions'];

    const result = section(mapStateToSections(state({ discussions })), 'discussions');

    expect(result.description).toBe('1 open');
    expect(result.children[0].label).toBe('first line');
    expect(result.children[0].markdown).toContain('- **claude**: hi');
  });

  it('should mark research proven and include notes when it has proof notes', () => {
    const research = [{ id: 4, topic: 'T', summary: 'S', findings: 'F', proven: 1, proven_notes: 'ok', discussion_id: null, created_at: 't' }];

    const result = section(mapStateToSections(state({ research })), 'research');

    expect(result.children[0]).toMatchObject({ id: 'research.4', label: 'T', description: 'proven' });
    expect(result.children[0].markdown).toContain('**Proof notes:** ok');
  });
});

describe('formatDetails', () => {
  it.each([[undefined], [null]])('should return an empty string when details is %s', (details) => {
    expect(formatDetails(details)).toBe('');
  });

  it('should return the string unchanged when details is a string', () => {
    expect(formatDetails('plain')).toBe('plain');
  });

  it('should wrap pretty JSON in a code fence when details is an object', () => {
    expect(formatDetails({ a: 1 })).toBe('```json\n{\n  "a": 1\n}\n```');
  });
});
