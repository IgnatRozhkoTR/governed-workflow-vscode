import type { ApiRequest, ApiResponse, HttpMethod, Locale, QueryValue } from '../shared/protocol';
import { normalizeWorkspaceState } from '../shared/normalizeState';
import { encodeBranchPath, wsPath } from '../shared/paths';
import { ApiError, AuthRequiredError } from './errors';
import type {
  BranchList,
  CommentQuery,
  ContextUpdate,
  CreateProjectRequest,
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  Criterion,
  DiffQuery,
  DiffRepo,
  DiffResponse,
  FileContentOptions,
  FileEntry,
  GateResult,
  NewComment,
  PasteImageResult,
  PlanStatus,
  Project,
  ProjectRepo,
  ProjectSettings,
  ReviewComment,
  ServerInfo,
  SetPhaseResult,
  SetupModule,
  SetupStartRequest,
  SetupStatus,
  StateFetchResult,
  TerminalSession,
  TerminalStartResponse,
  TerminalStatus,
  VerificationProfile,
  WorkspaceContext,
  WorkspaceRef,
  WorkspaceState,
  WorkspaceSummary,
} from './types';

type QueryParams = Readonly<Record<string, QueryValue>>;

interface RequestSpec {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query?: QueryParams;
  readonly body?: unknown;
  readonly form?: FormData;
  readonly headers?: Readonly<Record<string, string>>;
}

interface ServerErrorBody {
  readonly code: string;
  readonly message: string;
}

const HTTP_NOT_MODIFIED = 304;
const HTTP_UNAUTHORIZED = 401;
const NO_TOKEN_CONFIGURED_CODE = 'no_token_configured';
const CLAUDE_SESSION_KIND = 'claude';
const ERROR_MESSAGE_FIELDS = ['details', 'reason', 'message', 'error'] as const;
// The resolution the server gives a review thread a user resolves by hand, so bulk and single resolves agree.
const USER_REVIEW_RESOLUTION = 'out_of_scope';

export { encodeBranchPath, wsPath };

export class ApiClient {
  constructor(
    private readonly serverUrl: () => string,
    private readonly token: () => Promise<string | undefined>,
  ) {}

  async request(spec: ApiRequest): Promise<ApiResponse> {
    const headers = spec.ifNoneMatch === undefined ? undefined : { 'If-None-Match': spec.ifNoneMatch };
    const response = await this.send({ method: spec.method, path: spec.path, query: spec.query, body: spec.body, headers });
    const etag = response.headers.get('ETag') ?? undefined;
    return { status: response.status, body: await parseOptionalJson(response), etag };
  }

  async fetchI18n(locale: Locale): Promise<Record<string, string>> {
    return this.requestJson({ method: 'GET', path: `/i18n/${locale}.json` });
  }

  async checkToken(token: string): Promise<boolean> {
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) };
    const response = await this.fetchFrom(this.buildUrl('/api/auth/check'), init);
    if (response.status === HTTP_UNAUTHORIZED) {
      return rejectNoTokenConfigured(response);
    }
    if (!response.ok) {
      throw await toApiError(response);
    }
    return true;
  }

  getServerInfo(): Promise<ServerInfo> {
    return this.requestJson({ method: 'GET', path: '/api/server-info' });
  }

  async listProjects(): Promise<Project[]> {
    const body = await this.requestJson<{ projects: Project[] }>({ method: 'GET', path: '/api/projects' });
    return body.projects;
  }

  createProject(request: CreateProjectRequest): Promise<Project> {
    return this.requestJson({ method: 'POST', path: '/api/projects', body: request });
  }

  async listWorkspaces(projectId: string): Promise<WorkspaceSummary[]> {
    const path = `/api/projects/${encodeURIComponent(projectId)}/workspaces`;
    const body = await this.requestJson<{ workspaces: WorkspaceSummary[] }>({ method: 'GET', path });
    return body.workspaces;
  }

  listBranches(projectId: string): Promise<BranchList> {
    return this.requestJson({ method: 'GET', path: `/api/projects/${encodeURIComponent(projectId)}/branches` });
  }

  createWorkspace(projectId: string, request: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> {
    const path = `/api/projects/${encodeURIComponent(projectId)}/workspaces`;
    return this.requestJson({ method: 'POST', path, body: request });
  }

  getContext(workspace: WorkspaceRef): Promise<WorkspaceContext> {
    return this.requestJson({ method: 'GET', path: wsPath(workspace, 'context') });
  }

  async putContext(workspace: WorkspaceRef, update: ContextUpdate): Promise<void> {
    await this.send({ method: 'PUT', path: wsPath(workspace, 'context'), body: update });
  }

  async getState(workspace: WorkspaceRef, etag?: string): Promise<StateFetchResult> {
    const headers = etag === undefined ? undefined : { 'If-None-Match': etag };
    const response = await this.send({ method: 'GET', path: wsPath(workspace, 'state'), headers });
    if (response.status === HTTP_NOT_MODIFIED) {
      return { notModified: true };
    }
    const state = normalizeWorkspaceState(await parseJson<WorkspaceState>(response));
    return { notModified: false, state, etag: response.headers.get('ETag') ?? undefined };
  }

  async getCriteria(workspace: WorkspaceRef): Promise<Criterion[]> {
    const body = await this.requestJson<{ criteria: Criterion[] }>({ method: 'GET', path: wsPath(workspace, 'criteria') });
    return body.criteria;
  }

  async listRepos(workspace: WorkspaceRef): Promise<DiffRepo[]> {
    const body = await this.requestJson<{ repos: DiffRepo[] }>({ method: 'GET', path: wsPath(workspace, 'repos') });
    return body.repos;
  }

  getDiff(workspace: WorkspaceRef, query: DiffQuery): Promise<DiffResponse> {
    return this.requestJson({ method: 'GET', path: wsPath(workspace, 'diff'), query: { ...query } });
  }

  async listFiles(workspace: WorkspaceRef, dir: string): Promise<FileEntry[]> {
    const spec: RequestSpec = { method: 'GET', path: wsPath(workspace, 'files'), query: { path: dir } };
    const body = await this.requestJson<{ entries: FileEntry[] }>(spec);
    return body.entries;
  }

  async getFileContent(workspace: WorkspaceRef, path: string, options: FileContentOptions = {}): Promise<Uint8Array> {
    const query = { path, ref: options.ref, repo: options.repo };
    const response = await this.send({ method: 'GET', path: wsPath(workspace, 'file-content'), query });
    return new Uint8Array(await response.arrayBuffer());
  }

  async listComments(workspace: WorkspaceRef, query: CommentQuery = {}): Promise<ReviewComment[]> {
    const params = { scope: query.scope, resolved: query.resolved === undefined ? undefined : String(query.resolved) };
    const spec: RequestSpec = { method: 'GET', path: wsPath(workspace, 'comments'), query: params };
    const body = await this.requestJson<{ comments: ReviewComment[] }>(spec);
    return body.comments;
  }

  async addComment(workspace: WorkspaceRef, comment: NewComment): Promise<number> {
    const body = await this.requestJson<{ id: number }>({ method: 'POST', path: wsPath(workspace, 'comments'), body: comment });
    return body.id;
  }

  async replyToComment(workspace: WorkspaceRef, commentId: number, text: string): Promise<number> {
    const path = wsPath(workspace, `comments/${commentId}/reply`);
    const body = await this.requestJson<{ id: number }>({ method: 'POST', path, body: { text } });
    return body.id;
  }

  async resolveComment(workspace: WorkspaceRef, commentId: number, resolved: boolean): Promise<void> {
    await this.send({ method: 'PUT', path: wsPath(workspace, `comments/${commentId}/resolve`), body: { resolved } });
  }

  async resolveAllReviewIssues(workspaceId: number): Promise<number> {
    const path = `/api/workspaces/${encodeURIComponent(String(workspaceId))}/review-issues/resolve-all`;
    const body = await this.requestJson<{ resolved_count: number }>({ method: 'POST', path, body: { resolution: USER_REVIEW_RESOLUTION } });
    return body.resolved_count;
  }

  approve(workspace: WorkspaceRef, commitMessage?: string): Promise<GateResult> {
    const body = commitMessage?.trim() ? { commit_message: commitMessage } : {};
    return this.requestJson({ method: 'POST', path: wsPath(workspace, 'approve'), body });
  }

  reject(workspace: WorkspaceRef, comments: string): Promise<GateResult> {
    return this.requestJson({ method: 'POST', path: wsPath(workspace, 'reject'), body: { comments } });
  }

  async setPlanStatus(workspace: WorkspaceRef, status: PlanStatus): Promise<void> {
    await this.send({ method: 'POST', path: wsPath(workspace, 'plan-status'), body: { status } });
  }

  setPhase(workspace: WorkspaceRef, phase: string): Promise<SetPhaseResult> {
    return this.requestJson({ method: 'PUT', path: wsPath(workspace, 'phase'), body: { phase } });
  }

  async setYolo(workspace: WorkspaceRef, enabled: boolean): Promise<void> {
    await this.send({ method: 'PUT', path: wsPath(workspace, 'yolo'), body: { enabled } });
  }

  async terminalNotify(workspace: WorkspaceRef, message: string): Promise<void> {
    await this.send({ method: 'POST', path: wsPath(workspace, 'terminal/notify'), body: { message } });
  }

  terminalStart(workspace: WorkspaceRef): Promise<TerminalStartResponse> {
    return this.requestJson({ method: 'POST', path: wsPath(workspace, 'terminal/start') });
  }

  terminalResume(workspace: WorkspaceRef): Promise<TerminalStartResponse> {
    return this.requestJson({ method: 'POST', path: wsPath(workspace, 'terminal/resume') });
  }

  terminalStatus(workspace: WorkspaceRef): Promise<TerminalStatus> {
    return this.requestJson({ method: 'GET', path: wsPath(workspace, 'terminal/status') });
  }

  async terminalKill(workspace: WorkspaceRef, kind: string = CLAUDE_SESSION_KIND): Promise<void> {
    await this.send({ method: 'POST', path: wsPath(workspace, 'terminal/kill'), body: { kind } });
  }

  listTerminalSessions(): Promise<TerminalSession[]> {
    return this.requestJson({ method: 'GET', path: '/api/terminal/sessions' });
  }

  async killTerminalSession(name: string): Promise<void> {
    await this.send({ method: 'POST', path: `/api/terminal/sessions/${encodeURIComponent(name)}/kill` });
  }

  uploadPasteImage(workspace: WorkspaceRef, bytes: Uint8Array, mime: string, filename: string): Promise<PasteImageResult> {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(bytes)], { type: mime }), filename);
    return this.requestJson({ method: 'POST', path: wsPath(workspace, 'terminal/paste-image'), form });
  }

  async writeFile(workspace: WorkspaceRef, path: string, content: string): Promise<void> {
    await this.send({ method: 'PUT', path: wsPath(workspace, 'file'), body: { path, content } });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.send({ method: 'DELETE', path: `/api/projects/${encodeURIComponent(projectId)}` });
  }

  async archiveWorkspace(workspace: WorkspaceRef): Promise<void> {
    await this.send({ method: 'PUT', path: wsPath(workspace, 'archive') });
  }

  getProjectSettings(projectId: string): Promise<ProjectSettings> {
    return this.requestJson({ method: 'GET', path: `/api/projects/${encodeURIComponent(projectId)}/settings` });
  }

  async listProjectRepos(projectId: string): Promise<ProjectRepo[]> {
    const path = `/api/projects/${encodeURIComponent(projectId)}/repos`;
    const body = await this.requestJson<{ repos: ProjectRepo[] }>({ method: 'GET', path });
    return body.repos;
  }

  async listSetupModules(): Promise<SetupModule[]> {
    const body = await this.requestJson<{ modules: SetupModule[] }>({ method: 'GET', path: '/api/modules' });
    return body.modules;
  }

  async listEnabledModules(): Promise<string[]> {
    const body = await this.requestJson<{ modules: string[] }>({ method: 'GET', path: '/api/modules/enabled' });
    return body.modules;
  }

  async listVerificationProfiles(): Promise<VerificationProfile[]> {
    const body = await this.requestJson<{ profiles: VerificationProfile[] }>({ method: 'GET', path: '/api/verification/profiles' });
    return body.profiles;
  }

  async setupStart(request: SetupStartRequest): Promise<void> {
    await this.send({ method: 'POST', path: '/api/setup/start', body: request });
  }

  setupStatus(): Promise<SetupStatus> {
    return this.requestJson({ method: 'GET', path: '/api/setup/status' });
  }

  terminalSessionSocketUrl(name: string): Promise<string> {
    return this.socketUrl(`/ws/terminal-session/${encodeURIComponent(name)}`);
  }

  setupSocketUrl(): Promise<string> {
    return this.socketUrl('/ws/setup-terminal');
  }

  terminalSocketUrl(workspace: WorkspaceRef): Promise<string> {
    return this.socketUrl(terminalSocketPath(workspace));
  }

  private async socketUrl(path: string): Promise<string> {
    const token = await this.token();
    if (!token) {
      throw new AuthRequiredError('No admin token is stored. Sign in to the admin panel first.');
    }
    const url = new URL(this.buildUrl(path));
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', token);
    return url.toString();
  }

  private async requestJson<T>(spec: RequestSpec): Promise<T> {
    return parseJson<T>(await this.send(spec));
  }

  private async send(spec: RequestSpec): Promise<Response> {
    const response = await this.fetchFrom(this.buildUrl(spec.path, spec.query), await this.buildInit(spec));
    if (response.status === HTTP_UNAUTHORIZED) {
      throw new AuthRequiredError((await readErrorBody(response)).message);
    }
    if (!response.ok && response.status !== HTTP_NOT_MODIFIED) {
      throw await toApiError(response);
    }
    return response;
  }

  private async buildInit(spec: RequestSpec): Promise<RequestInit> {
    const headers: Record<string, string> = { Accept: 'application/json', ...spec.headers };
    const token = await this.token();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (spec.form !== undefined) {
      return { method: spec.method, headers, body: spec.form };
    }
    if (spec.body === undefined) {
      return { method: spec.method, headers };
    }
    headers['Content-Type'] = 'application/json';
    return { method: spec.method, headers, body: JSON.stringify(spec.body) };
  }

  private buildUrl(path: string, query: QueryParams = {}): string {
    const base = this.serverUrl();
    if (!URL.canParse(base + path)) {
      throw new ApiError(0, 'invalid_server_url', `The admin panel URL "${base}" is not a valid URL.`);
    }
    const url = new URL(base + path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async fetchFrom(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new ApiError(0, 'network_error', `Cannot reach the admin panel at ${this.serverUrl()}: ${cause}`);
    }
  }
}

// The backend also routes /ws/terminal/<project>/<path:branch>/<kind>, so a branch with '/'
// would be split into branch and kind; naming the default kind explicitly keeps the full branch.
function terminalSocketPath(workspace: WorkspaceRef): string {
  const project = encodeURIComponent(workspace.projectId);
  return `/ws/terminal/${project}/${encodeBranchPath(workspace.branch)}/${CLAUDE_SESSION_KIND}`;
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed as T;
  } catch {
    throw new ApiError(response.status, 'invalid_response', `The admin panel returned malformed JSON for ${response.url}.`);
  }
}

async function parseOptionalJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (response.status === HTTP_NOT_MODIFIED || text.trim() === '') {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function rejectNoTokenConfigured(response: Response): Promise<false> {
  const error = await toApiError(response);
  if (error.code === NO_TOKEN_CONFIGURED_CODE) {
    throw new ApiError(error.status, error.code, 'The admin panel has no token configured. Generate one on the panel host first.');
  }
  return false;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await readErrorBody(response);
  return new ApiError(response.status, body.code, body.message);
}

async function readErrorBody(response: Response): Promise<ServerErrorBody> {
  const text = await response.text();
  const fallback = { code: `http_${response.status}`, message: text.trim() || `${response.status} ${response.statusText}` };
  const parsed = tryParseObject(text);
  if (parsed === undefined) {
    return fallback;
  }
  const code = typeof parsed.error === 'string' ? parsed.error : fallback.code;
  const field = ERROR_MESSAGE_FIELDS.map((name) => parsed[name]).find((value) => typeof value === 'string');
  return { code, message: typeof field === 'string' ? field : fallback.message };
}

function tryParseObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
