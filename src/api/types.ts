export interface WorkspaceRef {
  readonly projectId: string;
  readonly branch: string;
}

export type ProjectType = 'single' | 'multi';

export interface Project {
  id: string;
  name: string;
  path: string;
  registered: string;
  project_type: ProjectType;
}

export interface CreateProjectRequest {
  path: string;
  name?: string;
  project_type?: ProjectType;
}

export interface SessionRecord {
  session_id: string;
  started_at: string;
}

export interface WorkspaceSummary {
  id: string;
  workspace_id: number;
  branch: string;
  phase: string;
  session_id: string | null;
  working_dir: string;
  status: string;
  created: string;
  workflow_mode: string | null;
  review_mode: string | null;
  sessions: SessionRecord[];
}

export interface BranchList {
  local: string[];
  remote: string[];
}

export interface CreateWorkspaceRequest {
  branch: string;
  source: string;
  worktree: boolean;
  workflow_mode?: string;
  review_mode?: string;
  yolo_mode?: boolean;
  repos?: number[];
}

export interface CreateWorkspaceResponse {
  workspace: string;
  working_dir: string;
  branch: string;
  command: string;
}

export interface Reply {
  id: number;
  text: string;
  author: string;
  created_at: string;
  status: string;
  resolved_at: string | null;
}

export interface Discussion {
  id: number;
  parent_id: number | null;
  text: string;
  author: string;
  status: string;
  type: string | null;
  hidden: number | null;
  created_at: string;
  resolved_at: string | null;
  replies: Reply[];
}

export interface WorkspaceContext {
  ticket_id: string;
  ticket_name: string;
  context: string;
  refs: string[];
  discussions: Discussion[];
}

export interface ContextUpdate {
  ticket_name?: string;
  context?: string;
  ticket_id?: string;
  refs?: string[];
}

export interface PhaseScope {
  must: string[];
  may?: string[];
}

export interface PlanTask {
  title: string;
  description?: string;
  files?: string[];
  agent?: string;
  group?: string;
  status?: string;
}

export interface PlanSubPhase {
  id: string;
  name?: string;
  scope?: PhaseScope;
  tasks?: PlanTask[];
}

export interface SystemDiagram {
  title: string;
  diagram: string;
}

export interface Plan {
  description?: string;
  systemDiagram?: SystemDiagram[];
  execution?: PlanSubPhase[];
}

export interface ProgressEntry {
  summary: string;
  created_at: string;
  updated_at: string;
  details?: unknown;
}

export interface ResearchEntry {
  id: number;
  topic: string;
  summary: string;
  findings: unknown;
  proven: number;
  proven_notes: string | null;
  discussion_id: number | null;
  created_at: string;
}

export interface PhaseTransition {
  from: string;
  to: string;
  time: string;
}

export interface PendingGate {
  phase: string;
  accepts_commit_message: boolean;
}

export interface ReviewComment {
  id: number;
  parent_id: number | null;
  scope: string;
  target: string | null;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  line_hash: string | null;
  text: string;
  author: string;
  type: string | null;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  resolution: string | null;
  replies?: Reply[];
}

export interface NewComment {
  scope: string;
  text: string;
  target?: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  line_hash?: string;
  author?: string;
}

export interface CommentQuery {
  scope?: string;
  resolved?: boolean;
}

export interface WorkspaceState {
  workspace_id: number;
  phase: string;
  status: string;
  scope: Record<string, PhaseScope>;
  plan: Plan;
  plan_status: string | null;
  phase_sequence: string[];
  enabled_phases: string[];
  workflow_mode: string;
  review_mode: string;
  locale: string;
  session_id: string | null;
  working_dir: string;
  branch: string;
  source_branch: string | null;
  project_type: ProjectType;
  claude_command: string;
  skip_permissions: boolean;
  restrict_to_workspace: boolean;
  allowed_external_paths: string;
  comments: Record<string, ReviewComment[]>;
  research: ResearchEntry[];
  discussions: Discussion[];
  phaseHistory: PhaseTransition[];
  progress: Record<string, ProgressEntry>;
  sessions: SessionRecord[];
  impact_analysis: unknown;
  yolo_mode: boolean;
  pending_gate: PendingGate | null;
}

export type StateFetchResult =
  | { readonly notModified: true }
  | { readonly notModified: false; readonly state: WorkspaceState; readonly etag?: string };

export interface Criterion {
  id: number;
  type: string;
  description: string;
  details: unknown;
  source: string | null;
  status: string;
  validated: number | null;
  validation_message: string | null;
}

export interface Scratchpad {
  name: string;
  title: string;
  updated_at: string;
  size: number;
}

export interface ScratchpadContent {
  name: string;
  content: string;
  updated_at: string;
}

export type DiffMode = 'branch' | 'uncommitted' | 'commit';

export interface DiffQuery {
  mode: DiffMode;
  repo?: string;
  base?: string;
  commit?: string;
}

export interface DiffFile {
  path: string;
  old_path: string | null;
  similarity: number | null;
  additions: number;
  deletions: number;
  diff: string;
  status?: string;
}

export interface DiffResponse {
  files: DiffFile[];
  mode: DiffMode;
  base?: string;
  commit?: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'dir' | 'file';
}

export interface FileContentOptions {
  ref?: string;
  repo?: string;
}

export interface GateResult {
  phase: string;
  previous_phase: string;
  status: string;
}

export interface TerminalStartResponse {
  session: string;
  attach_command: string;
  status: 'started' | 'created' | 'attached';
}

export interface TerminalStatus {
  session: string;
  exists: boolean;
  attach_command: string;
  kind: string;
}

export type PlanStatus = 'pending' | 'approved' | 'rejected';

export interface SetPhaseResult {
  phase: string;
  previous_phase: string;
}

export interface AvailablePhase {
  id: string;
  name: string;
  always_on: boolean;
  is_user_gate: boolean;
  templated: boolean;
}

export interface FileSnippet {
  path: string;
  lines: string[];
  total_lines: number;
  start?: number;
  end?: number;
  highlight_start?: number;
  highlight_end?: number;
}
