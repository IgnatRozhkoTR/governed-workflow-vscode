import type { ReviewComment, WorkspaceState } from '../../src/api/types';

export function makeState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    workspace_id: 1,
    phase: '3.1',
    status: 'active',
    scope: {},
    plan: {},
    plan_status: null,
    phase_sequence: [],
    enabled_phases: [],
    workflow_mode: 'full',
    review_mode: 'strict',
    locale: 'en',
    session_id: null,
    working_dir: '',
    branch: 'feature/x',
    source_branch: null,
    project_type: 'single',
    claude_command: 'claude',
    skip_permissions: false,
    restrict_to_workspace: false,
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
  };
}

export function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: 1,
    parent_id: null,
    scope: 'plan',
    target: 'Entire plan',
    file_path: null,
    line_start: null,
    line_end: null,
    line_hash: null,
    text: 'text',
    author: 'user',
    type: null,
    created_at: '2026-01-01T00:00:00',
    resolved: false,
    resolved_at: null,
    resolution: null,
    replies: [],
    ...overrides,
  };
}

export function memoryMemento(initial: Record<string, unknown> = {}): import('vscode').Memento {
  const values = new Map(Object.entries(initial));
  return {
    keys: () => [...values.keys()],
    get: <T>(key: string, defaultValue?: T) => (values.has(key) ? values.get(key) : defaultValue) as T,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  } as import('vscode').Memento;
}
