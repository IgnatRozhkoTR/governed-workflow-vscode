import * as vscode from 'vscode';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import { mapStateToLauncher, type LauncherItem } from './launcherItems';

export const LAUNCHER_VIEW_ID = 'governedWorkflow.state';
const OPEN_CONTROL_PANEL_COMMAND = 'governedWorkflow.openControlPanel';

export interface LauncherTreeDeps {
  readonly active: ActiveWorkspace;
}

class LauncherTreeProvider implements vscode.TreeDataProvider<LauncherItem>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData: vscode.Event<void> = this.changeEmitter.event;

  constructor(private readonly active: ActiveWorkspace) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(item: LauncherItem): vscode.TreeItem {
    return toTreeItem(item);
  }

  getChildren(element?: LauncherItem): LauncherItem[] {
    const state = this.active.state;
    return element === undefined && state !== undefined ? mapStateToLauncher(state) : [];
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}

function toTreeItem(item: LauncherItem): vscode.TreeItem {
  const treeItem = new vscode.TreeItem(item.label, vscode.TreeItemCollapsibleState.None);
  treeItem.id = `launcher:${item.id}`;
  treeItem.description = item.description;
  treeItem.iconPath = new vscode.ThemeIcon(item.icon);
  treeItem.contextValue = item.contextValue;
  treeItem.tooltip = `Open ${item.label} in Workspace Control`;
  treeItem.command = { command: OPEN_CONTROL_PANEL_COMMAND, title: 'Open Workspace Control', arguments: [item.nav] };
  return treeItem;
}

export function registerLauncherTree(context: vscode.ExtensionContext, deps: LauncherTreeDeps): void {
  const provider = new LauncherTreeProvider(deps.active);
  const view = vscode.window.createTreeView(LAUNCHER_VIEW_ID, { treeDataProvider: provider });
  const showBranch = (): void => {
    view.description = deps.active.ref?.branch;
  };
  context.subscriptions.push(
    provider,
    view,
    deps.active.onDidChange(() => {
      showBranch();
      provider.refresh();
    }),
    deps.active.onDidChangeState(() => provider.refresh()),
  );
}
