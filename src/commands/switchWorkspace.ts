import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import type { Project, WorkspaceRef } from '../api/types';

const SELECT_WORKSPACE_COMMAND = 'governedWorkflow.selectWorkspace';
const ARCHIVED_STATUS = 'archived';

export interface SwitchWorkspaceDeps {
  readonly client: ApiClient;
}

export async function pickAndSelectWorkspace(deps: SwitchWorkspaceDeps): Promise<void> {
  const project = await pickProject(deps);
  const ref = project === undefined ? undefined : await pickWorkspace(deps, project);
  if (ref !== undefined) {
    await vscode.commands.executeCommand(SELECT_WORKSPACE_COMMAND, ref);
  }
}

async function pickProject(deps: SwitchWorkspaceDeps): Promise<Project | undefined> {
  const projects = await deps.client.listProjects();
  const items = projects.map((project) => ({ label: project.name, description: project.path, project }));
  const picked = await vscode.window.showQuickPick(items, { title: 'Switch Workspace', placeHolder: 'Project' });
  return picked?.project;
}

async function pickWorkspace(deps: SwitchWorkspaceDeps, project: Project): Promise<WorkspaceRef | undefined> {
  const workspaces = await deps.client.listWorkspaces(project.id);
  const items = workspaces
    .filter((workspace) => workspace.status !== ARCHIVED_STATUS)
    .map((workspace) => ({ label: workspace.branch, description: workspace.phase, branch: workspace.branch }));
  if (items.length === 0) {
    void vscode.window.showInformationMessage(`Project ${project.name} has no active workspaces.`);
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(items, { title: `Switch Workspace: ${project.name}`, placeHolder: 'Workspace' });
  return picked === undefined ? undefined : { projectId: project.id, branch: picked.branch };
}
