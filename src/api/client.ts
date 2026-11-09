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
  DiffResponse,
  FileContentOptions,
  FileEntry,
  GateResult,
  NewComment,
  Project,
  ReviewComment,
  Scratchpad,
  ScratchpadContent,
  StateFetchResult,
  TerminalStartResponse,
  TerminalStatus,
  WorkspaceContext,
  WorkspaceRef,
  WorkspaceState,
  WorkspaceSummary,
} from './types';

type HttpMethod = 'GET' | 'POST' | 'PUT';
type QueryParams = Readonly<Record<string, string | undefined>>;

interface RequestSpec {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query?: QueryParams;
  readonly body?: unknown;
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

export function encodeBranchPath(branch: string): string {
  return branch.split('/').map(encodeURIComponent).join('/');
}

export function wsPath(workspace: WorkspaceRef, suffix: string): string {
  const project = encodeURIComponent(workspace.projectId);
  return `/api/ws/${project}/${encodeBranchPath(workspace.branch)}/${suffix}`;
}

export class ApiClient {
  constructor(
    private readonly serverUrl: () => string,
    private readonly token: () => Promise<string | undefined>,
  ) {}

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
    const state = await parseJson<WorkspaceState>(response);
    return { notModified: false, state, etag: response.headers.get('ETag') ?? undefined };
  }

  async getCriteria(workspace: WorkspaceRef): Promise<Criterion[]> {
    const body = await this.requestJson<{ criteria: Criterion[] }>({ method: 'GET', path: wsPath(workspace, 'criteria') });
    return body.criteria;
  }

  async listScratchpads(workspace: WorkspaceRef): Promise<Scratchpad[]> {
    const body = await this.requestJson<{ files: Scratchpad[] }>({ method: 'GET', path: wsPath(workspace, 'scratchpads') });
    return body.files;
  }

  getScratchpad(workspace: WorkspaceRef, name: string): Promise<ScratchpadContent> {
    return this.requestJson({ method: 'GET', path: wsPath(workspace, 'scratchpads/content'), query: { name } });
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

  approve(workspace: WorkspaceRef, commitMessage?: string): Promise<GateResult> {
    const body = commitMessage?.trim() ? { commit_message: commitMessage } : {};
    return this.requestJson({ method: 'POST', path: wsPath(workspace, 'approve'), body });
  }

  reject(workspace: WorkspaceRef, comments: string): Promise<GateResult> {
    return this.requestJson({ method: 'POST', path: wsPath(workspace, 'reject'), body: { comments } });
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

  async terminalKill(workspace: WorkspaceRef): Promise<void> {
    await this.send({ method: 'POST', path: wsPath(workspace, 'terminal/kill') });
  }

  async terminalSocketUrl(workspace: WorkspaceRef): Promise<string> {
    const token = await this.token();
    if (!token) {
      throw new AuthRequiredError('No admin token is stored. Sign in to the admin panel first.');
    }
    const url = new URL(this.buildUrl(terminalSocketPath(workspace)));
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
        url.searchParams.set(key, value);
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
