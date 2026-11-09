import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { Project, SetupModule, VerificationProfile, WorkspaceRef } from '../api/types';
import { openSocketTerminal } from '../terminal/terminalSessions';
import { SHOW_ARCHIVED_CONTEXT_KEY, type ProjectsTreeProvider } from '../views/projectsTree';
import { unwrapRef, type RefArgument } from './refArgument';

export const PROJECT_COMMAND_IDS = {
  removeProject: 'governedWorkflow.removeProject',
  archiveWorkspace: 'governedWorkflow.archiveWorkspace',
  toggleShowArchived: 'governedWorkflow.toggleShowArchived',
  runProjectSetup: 'governedWorkflow.runProjectSetup',
} as const;

const REMOVE_ACTION = 'Remove project';
const ARCHIVE_ACTION = 'Archive workspace';
const SETUP_TERMINAL_TITLE = 'Project setup';

export interface ProjectCommandDeps {
  readonly client: ApiClient;
  readonly projectsTree: ProjectsTreeProvider;
  readonly activeWorkspace: { readonly workspace: WorkspaceRef | undefined };
}

type ProjectArgument = { readonly project: Project } | undefined;

export function registerProjectCommands(context: vscode.ExtensionContext, deps: ProjectCommandDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(PROJECT_COMMAND_IDS.removeProject, (arg?: ProjectArgument) =>
      guarded(() => removeProject(deps, arg?.project)),
    ),
    vscode.commands.registerCommand(PROJECT_COMMAND_IDS.archiveWorkspace, (arg?: RefArgument) =>
      guarded(() => archiveWorkspace(deps, unwrapRef(arg) ?? deps.activeWorkspace.workspace)),
    ),
    vscode.commands.registerCommand(PROJECT_COMMAND_IDS.toggleShowArchived, () => toggleShowArchived(deps)),
    vscode.commands.registerCommand(PROJECT_COMMAND_IDS.runProjectSetup, () => guarded(() => runProjectSetup(deps))),
  );
}

async function guarded(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    await vscode.window.showErrorMessage(error.message);
  }
}

async function removeProject(deps: ProjectCommandDeps, project: Project | undefined): Promise<void> {
  if (project === undefined) {
    await vscode.window.showInformationMessage('Select a project in the Projects view first.');
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    `Remove project ${project.name} from Governed Workflow? Its workspaces are no longer tracked. Files on disk are kept.`,
    { modal: true },
    REMOVE_ACTION,
  );
  if (choice === REMOVE_ACTION) {
    await deps.client.deleteProject(project.id);
    deps.projectsTree.refresh();
  }
}

async function archiveWorkspace(deps: ProjectCommandDeps, ref: WorkspaceRef | undefined): Promise<void> {
  if (ref === undefined) {
    await vscode.window.showInformationMessage('Select a workspace first.');
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    `Archive workspace ${ref.branch}? Its worktree is removed from disk.`,
    { modal: true },
    ARCHIVE_ACTION,
  );
  if (choice === ARCHIVE_ACTION) {
    await deps.client.archiveWorkspace(ref);
    deps.projectsTree.refresh();
  }
}

async function toggleShowArchived(deps: ProjectCommandDeps): Promise<void> {
  const isShown = deps.projectsTree.toggleShowArchived();
  await vscode.commands.executeCommand('setContext', SHOW_ARCHIVED_CONTEXT_KEY, isShown);
}

async function runProjectSetup(deps: ProjectCommandDeps): Promise<void> {
  const [modules, profiles, enabled] = await Promise.all([
    deps.client.listSetupModules(),
    deps.client.listVerificationProfiles(),
    deps.client.listEnabledModules(),
  ]);
  const selectedModules = await pickModules(modules, enabled);
  const selectedProfiles = selectedModules && (await pickLanguages(profiles));
  if (!selectedModules || !selectedProfiles) {
    return;
  }
  await deps.client.setupStart({ modules: selectedModules, languages: selectedProfiles, custom_languages: [] });
  openSocketTerminal(SETUP_TERMINAL_TITLE, await deps.client.setupSocketUrl());
}

async function pickModules(modules: SetupModule[], enabled: string[]): Promise<string[] | undefined> {
  const items = modules.map((module) => ({
    label: module.name,
    description: module.id,
    detail: module.description,
    picked: enabled.includes(module.id),
    id: module.id,
  }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Modules to enable', canPickMany: true });
  return picked?.map((item) => item.id);
}

async function pickLanguages(profiles: VerificationProfile[]): Promise<number[] | undefined> {
  const items = profiles.map((profile) => ({ label: profile.name, description: profile.language, id: profile.id }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Verification languages', canPickMany: true });
  return picked?.map((item) => item.id);
}
