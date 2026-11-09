import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { Criterion, Scratchpad } from '../api/types';
import { mapStateToSections, type Node, type Section } from '../state/stateSections';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import { runWithErrorMessage } from '../diff/diffView';
import { ErrorItem } from './projectsTree';
import type { MarkdownDocProvider } from './markdownDocs';

export const STATE_VIEW_ID = 'governedWorkflow.state';
export const OPEN_DETAIL_COMMAND = 'governedWorkflow.openStateDetail';
export const OPEN_SCRATCHPAD_COMMAND = 'governedWorkflow.openScratchpad';
const CRITERIA_SECTION_ID = 'criteria';
const SCRATCHPADS_SECTION_ID = 'scratchpads';

type LazyKind = typeof CRITERIA_SECTION_ID | typeof SCRATCHPADS_SECTION_ID;

class SectionItem extends vscode.TreeItem {
  constructor(readonly section: Section) {
    super(section.label, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `section:${section.id}`;
    this.description = section.description;
  }
}

class LazySectionItem extends vscode.TreeItem {
  constructor(readonly kind: LazyKind, label: string) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `section:${kind}`;
  }
}

class NodeItem extends vscode.TreeItem {
  constructor(node: Node) {
    super(node.label, vscode.TreeItemCollapsibleState.None);
    this.id = node.id;
    this.description = node.description;
    if (node.markdown !== undefined) {
      this.command = { command: OPEN_DETAIL_COMMAND, title: 'Open Detail', arguments: [node.id, node.markdown] };
    }
  }
}

type StateTreeElement = SectionItem | LazySectionItem | NodeItem | ErrorItem;

export interface StateTreeDeps {
  readonly client: ApiClient;
  readonly active: ActiveWorkspace;
  readonly docs: MarkdownDocProvider;
}

export class StateTreeProvider implements vscode.TreeDataProvider<StateTreeElement> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData: vscode.Event<void> = this.changeEmitter.event;

  constructor(
    private readonly client: ApiClient,
    private readonly active: ActiveWorkspace,
  ) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(element: StateTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: StateTreeElement): Promise<StateTreeElement[]> {
    if (element === undefined) {
      return this.rootItems();
    }
    if (element instanceof SectionItem) {
      return element.section.children.map((node) => new NodeItem(node));
    }
    return element instanceof LazySectionItem ? this.lazyChildren(element.kind) : [];
  }

  private rootItems(): StateTreeElement[] {
    const state = this.active.state;
    if (state === undefined) {
      return [];
    }
    const lazy = [new LazySectionItem(CRITERIA_SECTION_ID, 'Criteria'), new LazySectionItem(SCRATCHPADS_SECTION_ID, 'Scratchpads')];
    return [...mapStateToSections(state).map((section) => new SectionItem(section)), ...lazy];
  }

  private async lazyChildren(kind: LazyKind): Promise<StateTreeElement[]> {
    const ref = this.active.ref;
    if (ref === undefined) {
      return [];
    }
    try {
      if (kind === CRITERIA_SECTION_ID) {
        return (await this.client.getCriteria(ref)).map(criterionItem);
      }
      return (await this.client.listScratchpads(ref)).map(scratchpadItem);
    } catch (error) {
      if (error instanceof ApiError) {
        return [new ErrorItem(error)];
      }
      throw error;
    }
  }
}

function criterionItem(criterion: Criterion): NodeItem {
  const markdown = `# ${criterion.type}\n\n${criterion.description}\n\n${criterion.validation_message ?? ''}`;
  return new NodeItem({ id: `criteria.${criterion.id}`, label: criterion.description, description: criterion.status, markdown });
}

function scratchpadItem(scratchpad: Scratchpad): vscode.TreeItem {
  const item = new vscode.TreeItem(scratchpad.title || scratchpad.name, vscode.TreeItemCollapsibleState.None);
  item.id = `scratchpad.${scratchpad.name}`;
  item.description = scratchpad.name;
  item.command = { command: OPEN_SCRATCHPAD_COMMAND, title: 'Open Scratchpad', arguments: [scratchpad.name] };
  return item;
}

export function registerStateTree(context: vscode.ExtensionContext, deps: StateTreeDeps): StateTreeProvider {
  const provider = new StateTreeProvider(deps.client, deps.active);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(STATE_VIEW_ID, provider),
    deps.active.onDidChange(() => provider.refresh()),
    deps.active.onDidChangeState(() => provider.refresh()),
    vscode.commands.registerCommand(OPEN_DETAIL_COMMAND, (key: string, markdown: string) => deps.docs.preview(key, markdown)),
    vscode.commands.registerCommand(OPEN_SCRATCHPAD_COMMAND, (name: string) => runWithErrorMessage(() => openScratchpad(deps, name))),
  );
  return provider;
}

async function openScratchpad(deps: StateTreeDeps, name: string): Promise<void> {
  const ref = deps.active.ref;
  if (ref === undefined) {
    return;
  }
  const scratchpad = await deps.client.getScratchpad(ref, name);
  await deps.docs.preview(`scratchpad-${name}`, scratchpad.content);
}
