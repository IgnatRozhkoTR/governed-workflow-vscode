import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type {
  BaseSyncResult,
  ContextUpdate,
  CreateWorkspaceRequest,
  Project,
  ProjectType,
  WorkspaceContext,
  WorkspaceRef,
} from '../api/types';
import type { TokenStore } from '../config/tokenStore';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import { remoteFileUriParts } from '../fs/uris';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import { NEW_WORKSPACE_NAV } from '../shared/navigation';
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

interface WorkspaceChoices {
  readonly branch: string;
  readonly isYolo: boolean;
  readonly isFast: boolean;
}

async function createWorkspace(deps: WorkspaceCommandDeps, preselected: Project | undefined): Promise<void> {
  const project = preselected ?? (await pickProject(deps));
  const choices = project && (await promptWorkspaceChoices(deps, project));
  if (!project || !choices) {
    return;
  }
  const response = await deps.client.createWorkspace(project.id, toCreateRequest(choices));
  const ref = { projectId: project.id, branch: choices.branch };
  notifyBaseSync(response.base_sync, response.branch);
  response.attached_repos?.forEach((repo) => notifyBaseSync(repo.base_sync, repo.rel_path));
  deps.projectsTree.refresh();
  await deps.selector.select(ref, NEW_WORKSPACE_NAV);
  await offerResume(ref);
}

export function toCreateRequest(choices: WorkspaceChoices): CreateWorkspaceRequest {
  return {
    branch: choices.branch,
    ...(choices.isYolo ? { yolo_mode: true } : {}),
    ...(choices.isFast ? { workflow_mode: 'fast' } : {}),
  };
}

async function promptWorkspaceChoices(deps: WorkspaceCommandDeps, project: Project): Promise<WorkspaceChoices | undefined> {
  const branch = (await vscode.window.showInputBox({ prompt: 'Workspace name (branch)', ignoreFocusOut: true }))?.trim();
  if (!branch) {
    return undefined;
  }
  const settings = await deps.client.getProjectSettings(project.id);
  const isYolo = settings.yolo_mode_default ? false : await askEnable('YOLO mode?');
  const isFast = isYolo === undefined || settings.fast_mode_default ? false : await askEnable('Fast mode?');
  return isYolo === undefined || isFast === undefined ? undefined : { branch, isYolo, isFast };
}

async function askEnable(placeHolder: string): Promise<boolean | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: 'No', value: false },
      { label: 'Yes', value: true },
    ],
    { placeHolder, ignoreFocusOut: true },
  );
  return picked?.value;
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
