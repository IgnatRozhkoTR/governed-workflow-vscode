import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type {
  BaseSyncResult,
  ContextUpdate,
  CreateWorkspaceRequest,
  Project,
  ProjectType,
  ReviewMode,
  WorkspaceContext,
  WorkspaceRef,
} from '../api/types';
import type { TokenStore } from '../config/tokenStore';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import { remoteFileUriParts } from '../fs/uris';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import type { ProjectsTreeProvider } from '../views/projectsTree';
import type { WorkspaceSelector } from '../worktree/workspaceSelector';
import { unwrapRef, type RefArgument } from './refArgument';

export const COMMAND_IDS = {
  selectWorkspace: 'governedWorkflow.selectWorkspace',
  openWorktree: 'governedWorkflow.openWorktree',
  createProject: 'governedWorkflow.createProject',
  createWorkspace: 'governedWorkflow.createWorkspace',
  editTicketContext: 'governedWorkflow.editTicketContext',
  setToken: 'governedWorkflow.setToken',
  refresh: 'governedWorkflow.refresh',
  resumeClaude: 'governedWorkflow.resumeClaude',
} as const;

const THIS_WINDOW = 'This window';
const NEW_WINDOW = 'New window';
const RESUME_SESSION = 'Resume Claude session';
const WORKFLOW_MODES = ['standard', 'fast'] as const;
const REVIEW_MODES: readonly ReviewMode[] = ['manual', 'integration', 'files_integration', 'full'];
const TRIVIAL_SYNC_REASONS = ['no-local-branch', 'not-remote-based'];
const PROJECT_TYPES: readonly ProjectType[] = ['single', 'multi'];

export interface WorkspaceCommandDeps {
  readonly client: ApiClient;
  readonly active: ActiveWorkspace;
  readonly tokens: TokenStore;
  readonly locator: WorkspaceLocator;
  readonly projectsTree: ProjectsTreeProvider;
  readonly selector: WorkspaceSelector;
}

type ProjectArgument = { readonly project: Project } | undefined;

export function registerWorkspaceCommands(context: vscode.ExtensionContext, deps: WorkspaceCommandDeps): void {
  const handlers: Record<string, (arg?: RefArgument) => Promise<void>> = {
    [COMMAND_IDS.selectWorkspace]: (arg) => deps.selector.select(requireRef(deps, arg)),
    [COMMAND_IDS.openWorktree]: async (arg) => openWorktree(deps, requireRef(deps, arg)),
    [COMMAND_IDS.createProject]: () => createProject(deps),
    [COMMAND_IDS.editTicketContext]: async (arg) => editTicketContext(deps, requireRef(deps, arg)),
    [COMMAND_IDS.setToken]: () => setToken(deps),
    [COMMAND_IDS.refresh]: () => refresh(deps),
  };
  for (const [id, handler] of Object.entries(handlers)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, (arg?: RefArgument) => guarded(handler(arg))));
  }
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.createWorkspace, (arg?: ProjectArgument) => guarded(createWorkspace(deps, arg?.project))),
    deps.active.onDidChange((ref) => watchAuth(deps, ref)),
  );
}

function watchAuth(deps: WorkspaceCommandDeps, ref: WorkspaceRef | undefined): void {
  if (ref !== undefined) {
    deps.active.poller?.onAuthRequired(() => void vscode.commands.executeCommand(COMMAND_IDS.setToken));
  }
}

async function guarded(action: Promise<void>): Promise<void> {
  try {
    await action;
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    await vscode.window.showErrorMessage(error.message);
  }
}

function requireRef(deps: WorkspaceCommandDeps, arg: RefArgument): WorkspaceRef {
  const ref = unwrapRef(arg) ?? deps.active.ref;
  if (ref === undefined) {
    throw new ApiError(0, 'no_workspace_selected', 'Select a workspace first.');
  }
  return ref;
}

async function openWorktree(deps: WorkspaceCommandDeps, ref: WorkspaceRef): Promise<void> {
  const fetched = await deps.client.getState(ref);
  if (fetched.notModified) {
    return;
  }
  if (deps.locator.isLocal(fetched.state)) {
    await openLocalFolder(fetched.state.working_dir);
    return;
  }
  const uri = vscode.Uri.from(remoteFileUriParts({ workspace: ref, relPath: '' }));
  const count = vscode.workspace.workspaceFolders?.length ?? 0;
  vscode.workspace.updateWorkspaceFolders(count, 0, { uri, name: ref.branch });
}

async function openLocalFolder(workingDir: string): Promise<void> {
  const choice = await vscode.window.showQuickPick([THIS_WINDOW, NEW_WINDOW], { placeHolder: 'Open worktree in' });
  if (choice === undefined) {
    return;
  }
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(workingDir), { forceNewWindow: choice === NEW_WINDOW });
}

async function createProject(deps: WorkspaceCommandDeps): Promise<void> {
  const path = await vscode.window.showInputBox({ prompt: 'Absolute path of the project on the admin panel host', ignoreFocusOut: true });
  if (!path) {
    return;
  }
  const name = await vscode.window.showInputBox({ prompt: 'Project name (optional)' });
  const projectType = (await vscode.window.showQuickPick([...PROJECT_TYPES], { placeHolder: 'Project type' })) as ProjectType | undefined;
  if (projectType === undefined) {
    return;
  }
  await deps.client.createProject({ path, name: name || undefined, project_type: projectType });
  deps.projectsTree.refresh();
}

async function pickProject(deps: WorkspaceCommandDeps): Promise<Project | undefined> {
  const projects = await deps.client.listProjects();
  const items = projects.map((project) => ({ label: project.name, description: project.path, project }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Project' });
  return picked?.project;
}

async function pickSourceBranch(deps: WorkspaceCommandDeps, project: Project): Promise<string | undefined> {
  const branches = await deps.client.listBranches(project.id);
  return vscode.window.showQuickPick([...branches.local, ...branches.remote], { placeHolder: 'Create from branch' });
}

interface WorkspaceChoices {
  readonly branch: string;
  readonly source: string;
  readonly workflowMode: string;
  readonly worktree: boolean;
  readonly reviewMode: ReviewMode;
  readonly yoloMode: boolean;
  readonly repos: number[];
}

async function createWorkspace(deps: WorkspaceCommandDeps, preselected: Project | undefined): Promise<void> {
  const project = preselected ?? (await pickProject(deps));
  const choices = project && (await promptWorkspaceChoices(deps, project));
  if (!project || !choices) {
    return;
  }
  const ticketName = await vscode.window.showInputBox({ prompt: 'Ticket name (optional)' });
  const ticketContext = await vscode.window.showInputBox({ prompt: 'Ticket context (optional)' });
  const response = await deps.client.createWorkspace(project.id, toCreateRequest(choices, project));
  const ref = { projectId: project.id, branch: choices.branch };
  notifyBaseSync(response.base_sync, choices.source);
  response.attached_repos?.forEach((repo) => notifyBaseSync(repo.base_sync, repo.rel_path));
  await applyInitialContext(deps, ref, ticketName, ticketContext);
  deps.projectsTree.refresh();
  await deps.selector.selectInThisWindow(ref);
  await offerResume(ref);
}

function toCreateRequest(choices: WorkspaceChoices, project: Project): CreateWorkspaceRequest {
  return {
    branch: choices.branch,
    source: choices.source,
    worktree: choices.worktree,
    workflow_mode: choices.workflowMode,
    review_mode: choices.reviewMode,
    yolo_mode: choices.yoloMode,
    repos: project.project_type === 'multi' ? choices.repos : undefined,
  };
}

async function promptWorkspaceChoices(deps: WorkspaceCommandDeps, project: Project): Promise<WorkspaceChoices | undefined> {
  const branch = await vscode.window.showInputBox({ prompt: 'New branch name', ignoreFocusOut: true });
  const source = branch ? await pickSourceBranch(deps, project) : undefined;
  const workflowMode = source ? await vscode.window.showQuickPick([...WORKFLOW_MODES], { placeHolder: 'Workflow mode' }) : undefined;
  const settings = workflowMode ? await deps.client.getProjectSettings(project.id) : undefined;
  const worktree = settings && (await pickYesNo('Create a git worktree for this workspace?', true));
  const reviewMode = worktree === undefined ? undefined : await pickReviewMode(settings?.review_mode_default);
  const yoloMode = reviewMode && (await pickYesNo('Enable YOLO mode?', settings?.yolo_mode_default ?? false));
  const repos = yoloMode === undefined ? undefined : await pickRepos(deps, project);
  if (!branch || !source || !workflowMode || worktree === undefined || !reviewMode || yoloMode === undefined || !repos) {
    return undefined;
  }
  return { branch, source, workflowMode, worktree, reviewMode, yoloMode, repos };
}

async function pickYesNo(placeHolder: string, defaultValue: boolean): Promise<boolean | undefined> {
  const items = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ].map((item) => ({ ...item, description: item.value === defaultValue ? 'default' : undefined }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder });
  return picked?.value;
}

async function pickReviewMode(defaultMode: ReviewMode | undefined): Promise<ReviewMode | undefined> {
  const items = REVIEW_MODES.map((mode) => ({ label: mode, description: mode === defaultMode ? 'project default' : undefined }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Review mode' });
  return picked?.label;
}

async function pickRepos(deps: WorkspaceCommandDeps, project: Project): Promise<number[] | undefined> {
  if (project.project_type !== 'multi') {
    return [];
  }
  const repos = await deps.client.listProjectRepos(project.id);
  const items = repos.map((repo) => ({ label: repo.rel_path, description: repo.base_branch ?? undefined, id: repo.id }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Repositories to attach', canPickMany: true });
  return picked?.map((item) => item.id);
}

function notifyBaseSync(baseSync: BaseSyncResult | undefined, fallbackBranch: string): void {
  if (baseSync === undefined) {
    return;
  }
  const branch = baseSync.branch ?? fallbackBranch;
  if (baseSync.updated) {
    void vscode.window.showInformationMessage(`Base branch ${branch} was updated from origin.`);
    return;
  }
  if (baseSync.reason !== undefined && !TRIVIAL_SYNC_REASONS.includes(baseSync.reason)) {
    void vscode.window.showWarningMessage(`Base branch ${branch} was not updated: ${baseSync.reason}.`);
  }
}

async function applyInitialContext(
  deps: WorkspaceCommandDeps,
  ref: WorkspaceRef,
  ticketName: string | undefined,
  ticketContext: string | undefined,
): Promise<void> {
  if (ticketName || ticketContext) {
    await deps.client.putContext(ref, { ticket_name: ticketName || undefined, context: ticketContext || undefined });
  }
}

async function offerResume(ref: WorkspaceRef): Promise<void> {
  const choice = await vscode.window.showInformationMessage(`Workspace ${ref.branch} created.`, RESUME_SESSION);
  if (choice === RESUME_SESSION) {
    await vscode.commands.executeCommand(COMMAND_IDS.resumeClaude, ref);
  }
}

async function editTicketContext(deps: WorkspaceCommandDeps, ref: WorkspaceRef): Promise<void> {
  const current = await deps.client.getContext(ref);
  const update = await promptContextUpdate(current);
  if (update === undefined) {
    return;
  }
  await deps.client.putContext(ref, update);
  await deps.active.poller?.refreshNow();
}

async function promptContextUpdate(current: WorkspaceContext): Promise<ContextUpdate | undefined> {
  const ticketId = await vscode.window.showInputBox({ prompt: 'Ticket ID', value: current.ticket_id });
  if (ticketId === undefined) {
    return undefined;
  }
  const ticketName = await vscode.window.showInputBox({ prompt: 'Ticket name', value: current.ticket_name });
  if (ticketName === undefined) {
    return undefined;
  }
  const ticketContext = await vscode.window.showInputBox({ prompt: 'Ticket context', value: current.context });
  if (ticketContext === undefined) {
    return undefined;
  }
  const refsInput = await vscode.window.showInputBox({ prompt: 'Refs (comma-separated)', value: current.refs.join(', ') });
  if (refsInput === undefined) {
    return undefined;
  }
  return { ticket_id: ticketId, ticket_name: ticketName, context: ticketContext, refs: parseRefs(refsInput) };
}

function parseRefs(input: string): string[] {
  return input
    .split(',')
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0);
}

async function setToken(deps: WorkspaceCommandDeps): Promise<void> {
  const token = await vscode.window.showInputBox({ prompt: 'Admin panel token', password: true, ignoreFocusOut: true });
  if (!token) {
    return;
  }
  if (!(await deps.client.checkToken(token))) {
    await vscode.window.showErrorMessage('The admin panel rejected this token.');
    return;
  }
  await deps.tokens.set(token);
  await refresh(deps);
}

async function refresh(deps: WorkspaceCommandDeps): Promise<void> {
  deps.projectsTree.refresh();
  await deps.active.poller?.refreshNow();
}
