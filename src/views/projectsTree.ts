import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { AuthRequiredError } from '../api/errors';
import type { Project, WorkspaceRef, WorkspaceSummary } from '../api/types';

export const PROJECTS_VIEW_ID = 'governedWorkflow.projects';
export const SELECT_WORKSPACE_COMMAND = 'governedWorkflow.selectWorkspace';
export const SET_TOKEN_COMMAND = 'governedWorkflow.setToken';
export const WORKSPACE_CONTEXT_VALUE = 'gwWorkspace';
const ARCHIVED_STATUS = 'archived';

export class ProjectItem extends vscode.TreeItem {
  constructor(readonly project: Project) {
    super(project.name, vscode.TreeItemCollapsibleState.Expanded);
    this.id = `project:${project.id}`;
    this.description = project.project_type;
    this.tooltip = project.path;
    this.contextValue = 'gwProject';
  }
}

export class WorkspaceItem extends vscode.TreeItem {
  readonly ref: WorkspaceRef;

  constructor(readonly summary: WorkspaceSummary, projectId: string) {
    super(summary.branch, vscode.TreeItemCollapsibleState.None);
    this.ref = { projectId, branch: summary.branch };
    this.id = `workspace:${projectId}:${summary.branch}`;
    this.description = summary.phase;
    this.contextValue = WORKSPACE_CONTEXT_VALUE;
    this.command = { command: SELECT_WORKSPACE_COMMAND, title: 'Select Workspace', arguments: [this.ref] };
  }
}

export class ErrorItem extends vscode.TreeItem {
  constructor(error: unknown) {
    super(error instanceof Error ? error.message : String(error), vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('error');
    this.contextValue = 'gwError';
    if (error instanceof AuthRequiredError) {
      this.command = { command: SET_TOKEN_COMMAND, title: 'Set Admin Token' };
    }
  }
}

export type ProjectsTreeElement = ProjectItem | WorkspaceItem | ErrorItem;

export interface ProjectsTreeDeps {
  readonly client: ApiClient;
}

export class ProjectsTreeProvider implements vscode.TreeDataProvider<ProjectsTreeElement> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData: vscode.Event<void> = this.changeEmitter.event;

  constructor(private readonly client: ApiClient) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(element: ProjectsTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ProjectsTreeElement): Promise<ProjectsTreeElement[]> {
    try {
      if (element === undefined) {
        return (await this.client.listProjects()).map((project) => new ProjectItem(project));
      }
      return element instanceof ProjectItem ? await this.listWorkspaceItems(element.project) : [];
    } catch (error) {
      return [new ErrorItem(error)];
    }
  }

  private async listWorkspaceItems(project: Project): Promise<WorkspaceItem[]> {
    const workspaces = await this.client.listWorkspaces(project.id);
    return workspaces
      .filter((workspace) => workspace.status !== ARCHIVED_STATUS)
      .map((workspace) => new WorkspaceItem(workspace, project.id));
  }
}

export function registerProjectsTree(context: vscode.ExtensionContext, deps: ProjectsTreeDeps): ProjectsTreeProvider {
  const provider = new ProjectsTreeProvider(deps.client);
  context.subscriptions.push(vscode.window.registerTreeDataProvider(PROJECTS_VIEW_ID, provider));
  return provider;
}
