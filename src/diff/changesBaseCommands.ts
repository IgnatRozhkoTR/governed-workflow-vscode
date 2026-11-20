import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import type { RepoBranch } from '../api/types';
import type { RepoChanges } from './changesModel';
import type { ChangesTreeNode, ChangesTreeProvider, ChangesWorkspaceSource } from './changesTree';
import { runWithErrorMessage } from './diffView';

export const CHANGE_BASE_COMMAND = 'governedWorkflow.changes.changeBase';
export const RESET_BASE_COMMAND = 'governedWorkflow.changes.resetBase';
export const FILTER_REPO_COMMAND = 'governedWorkflow.changes.filterRepo';

export interface BasePickItem extends vscode.QuickPickItem {
  readonly base: string | undefined;
}

export interface RepoFilterPickItem extends vscode.QuickPickItem {
  readonly repoPath: string | undefined;
}

interface RepoPickItem extends vscode.QuickPickItem {
  readonly repo: RepoChanges;
}

export interface ChangesBaseCommandDeps {
  readonly client: ApiClient;
  readonly active: ChangesWorkspaceSource;
  readonly provider: ChangesTreeProvider;
}

export function registerChangesBaseCommands(deps: ChangesBaseCommandDeps): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CHANGE_BASE_COMMAND, (node?: ChangesTreeNode) => runWithErrorMessage(() => changeBase(deps, node))),
    vscode.commands.registerCommand(RESET_BASE_COMMAND, (node?: ChangesTreeNode) => resetBase(deps, node)),
    vscode.commands.registerCommand(FILTER_REPO_COMMAND, () => filterRepo(deps.provider)),
  ];
}

export function basePickItems(repo: RepoChanges, branches: readonly RepoBranch[]): BasePickItem[] {
  const currentBase = repo.baseOverride ?? repo.defaultBase;
  const defaultItem: BasePickItem = {
    label: '$(discard) Default base',
    description: repo.defaultBase,
    detail: 'The base branch configured for this repository',
    base: undefined,
  };
  const branchItems = branches.map((branch): BasePickItem => ({
    label: branch.name,
    description: branchDescription(branch, currentBase),
    base: branch.name,
  }));
  return [defaultItem, ...branchItems];
}

export function withTypedRef(items: readonly BasePickItem[], typed: string): BasePickItem[] {
  const ref = typed.trim();
  if (ref === '' || items.some((item) => item.base === ref)) {
    return [...items];
  }
  return [{ label: ref, description: 'Use this ref (branch, tag or commit)', alwaysShow: true, base: ref }, ...items];
}

export function repoFilterPickItems(repos: readonly RepoChanges[], activeFilter: string | undefined): RepoFilterPickItem[] {
  const allItem: RepoFilterPickItem = { label: 'All repositories', description: activeFilter === undefined ? 'shown' : undefined, repoPath: undefined };
  const repoItems = repos.map((repo): RepoFilterPickItem => ({
    label: repo.name,
    description: repo.path === activeFilter ? 'shown' : `${repo.files.length} changed`,
    repoPath: repo.path,
  }));
  return [allItem, ...repoItems];
}

async function changeBase(deps: ChangesBaseCommandDeps, node: ChangesTreeNode | undefined): Promise<void> {
  const repo = await targetRepo(deps.provider, node);
  const workspace = deps.active.ref;
  if (repo === undefined || workspace === undefined) {
    return;
  }
  const branches = await deps.client.listRepoBranches(workspace, repo.path);
  const picked = await pickBase(repo, basePickItems(repo, branches));
  if (picked !== undefined) {
    await deps.provider.setBaseOverride(repo, picked.base);
  }
}

async function resetBase(deps: ChangesBaseCommandDeps, node: ChangesTreeNode | undefined): Promise<void> {
  const repo = await targetRepo(deps.provider, node);
  if (repo !== undefined) {
    await deps.provider.setBaseOverride(repo, undefined);
  }
}

async function filterRepo(provider: ChangesTreeProvider): Promise<void> {
  const picked = await vscode.window.showQuickPick(repoFilterPickItems(provider.repos, provider.repoFilter), {
    placeHolder: 'Show changes of one repository or all of them',
  });
  if (picked !== undefined) {
    await provider.setRepoFilter(picked.repoPath);
  }
}

async function targetRepo(provider: ChangesTreeProvider, node: ChangesTreeNode | undefined): Promise<RepoChanges | undefined> {
  if (node?.type === 'repo') {
    return node.repo;
  }
  const candidates = provider.visibleRepos;
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage('The Changes view has not loaded any repository yet.');
    return undefined;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  const items = candidates.map((repo): RepoPickItem => ({ label: repo.name, description: repo.source.base ? `vs ${repo.source.base}` : undefined, repo }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a repository' });
  return picked?.repo;
}

function pickBase(repo: RepoChanges, items: readonly BasePickItem[]): Promise<BasePickItem | undefined> {
  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick<BasePickItem>();
    quickPick.title = `Change base for ${repo.name}`;
    quickPick.placeholder = 'Pick a branch, or type a branch, tag or commit';
    quickPick.items = items;
    quickPick.onDidChangeValue((value) => (quickPick.items = withTypedRef(items, value)));
    quickPick.onDidAccept(() => {
      resolve(quickPick.selectedItems[0]);
      quickPick.hide();
    });
    quickPick.onDidHide(() => {
      resolve(undefined);
      quickPick.dispose();
    });
    quickPick.show();
  });
}

function branchDescription(branch: RepoBranch, currentBase: string | undefined): string | undefined {
  if (branch.name === currentBase) {
    return 'current base';
  }
  return branch.current ? 'workspace branch' : undefined;
}
