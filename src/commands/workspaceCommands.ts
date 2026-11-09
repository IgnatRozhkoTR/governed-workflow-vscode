import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { ContextUpdate, Project, ProjectType, WorkspaceContext, WorkspaceRef } from '../api/types';
import type { TokenStore } from '../config/tokenStore';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import { remoteFileUriParts } from '../fs/uris';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import type { ProjectsTreeProvider } from '../views/projectsTree';
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
const PROJECT_TYPES: readonly ProjectType[] = ['single', 'multi'];

export interface WorkspaceCommandDeps {
  readonly client: ApiClient;
  readonly active: ActiveWorkspace;
  readonly tokens: TokenStore;
  readonly locator: WorkspaceLocator;
  readonly projectsTree: ProjectsTreeProvider;
}

type ProjectArgument = { readonly project: Project } | undefined;

export function registerWorkspaceCommands(context: vscode.ExtensionContext, deps: WorkspaceCommandDeps): void {
  const handlers: Record<string, (arg?: RefArgument) => Promise<void>> = {
    [COMMAND_IDS.selectWorkspace]: async (arg) => selectWorkspace(deps, requireRef(deps, arg)),
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

function selectWorkspace(deps: WorkspaceCommandDeps, ref: WorkspaceRef): void {
  deps.active.select(ref);
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

async function createWorkspace(deps: WorkspaceCommandDeps, preselected: Project | undefined): Promise<void> {
  const project = preselected ?? (await pickProject(deps));
  const branch = project && (await vscode.window.showInputBox({ prompt: 'New branch name', ignoreFocusOut: true }));
  const source = branch ? await pickSourceBranch(deps, project) : undefined;
  const mode = source ? await vscode.window.showQuickPick([...WORKFLOW_MODES], { placeHolder: 'Workflow mode' }) : undefined;
  if (!project || !branch || !source || !mode) {
    return;
  }
  const ticketName = await vscode.window.showInputBox({ prompt: 'Ticket name (optional)' });
  const ticketContext = await vscode.window.showInputBox({ prompt: 'Ticket context (optional)' });
  await deps.client.createWorkspace(project.id, { branch, source, worktree: true, workflow_mode: mode });
  const ref = { projectId: project.id, branch };
  await applyInitialContext(deps, ref, ticketName, ticketContext);
  deps.projectsTree.refresh();
  deps.active.select(ref);
  await offerResume(ref);
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
