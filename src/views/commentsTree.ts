import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ReviewComment } from '../api/types';
import {
  COMMENT_FILTERS,
  countOpenComments,
  groupCommentsByArea,
  isCodeComment,
  panelNavFor,
  type AreaGroup,
  type CommentFilter,
  type TargetGroup,
} from '../comments/commentGrouping';
import { authorLabel, codePathOf, lineSpanOf } from '../comments/commentMapping';
import type { ReviewCommentController } from '../comments/reviewComments';
import type { WorkspaceComments } from '../comments/workspaceComments';
import { runWithErrorMessage } from '../diff/diffView';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import type { WorkspaceControlPanelHost } from '../webview/controlPanel';

export const COMMENTS_VIEW_ID = 'governedWorkflow.comments';
export const COMMENTS_FILTER_COMMAND = 'governedWorkflow.comments.filter';
export const COMMENTS_OPEN_COMMAND = 'governedWorkflow.comments.open';
export const COMMENTS_REPLY_COMMAND = 'governedWorkflow.comments.reply';
export const COMMENTS_RESOLVE_COMMAND = 'governedWorkflow.comments.resolve';
export const COMMENTS_UNRESOLVE_COMMAND = 'governedWorkflow.comments.unresolve';
export const OPEN_COMMENT_CONTEXT = 'gwCommentOpen';
export const RESOLVED_COMMENT_CONTEXT = 'gwCommentResolved';
const FILTER_STATE_KEY = 'governedWorkflow.comments.filter';
const SUMMARY_LENGTH = 80;

const FILTER_LABELS: Readonly<Record<CommentFilter, string>> = { open: 'Open', resolved: 'Resolved', all: 'All' };

const AREA_ICONS: Readonly<Record<string, string>> = {
  plan: 'checklist',
  architecture: 'type-hierarchy',
  scope: 'target',
  criteria: 'tasklist',
  research: 'search',
  impact: 'pulse',
  review: 'code',
  phase: 'milestone',
};

export interface CommentsTreeDeps {
  readonly comments: WorkspaceComments;
  readonly controller: ReviewCommentController;
  readonly locator: WorkspaceLocator;
  readonly panel: WorkspaceControlPanelHost;
}

type CommentsNode =
  | { readonly kind: 'area'; readonly area: AreaGroup }
  | { readonly kind: 'target'; readonly group: TargetGroup }
  | { readonly kind: 'comment'; readonly comment: ReviewComment };

class CommentsTreeProvider implements vscode.TreeDataProvider<CommentsNode> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData: vscode.Event<void> = this.changeEmitter.event;

  constructor(
    private readonly comments: WorkspaceComments,
    private readonly locator: WorkspaceLocator,
    public filter: CommentFilter,
  ) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  getChildren(node?: CommentsNode): CommentsNode[] {
    if (node === undefined) {
      return this.areas().map((area) => ({ kind: 'area', area }));
    }
    switch (node.kind) {
      case 'area':
        return node.area.targets.map((group) => ({ kind: 'target', group }));
      case 'target':
        return node.group.comments.map((comment) => ({ kind: 'comment', comment }));
      case 'comment':
        return [];
    }
  }

  getTreeItem(node: CommentsNode): vscode.TreeItem {
    switch (node.kind) {
      case 'area':
        return this.areaItem(node.area);
      case 'target':
        return this.targetItem(node.group);
      case 'comment':
        return commentItem(node.comment);
    }
  }

  areas(): AreaGroup[] {
    return this.comments.snapshot === undefined ? [] : groupCommentsByArea(this.comments.byTarget, this.filter);
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  private areaItem(area: AreaGroup): vscode.TreeItem {
    const item = new vscode.TreeItem(area.label, vscode.TreeItemCollapsibleState.Expanded);
    item.id = `area:${area.scope}`;
    item.iconPath = new vscode.ThemeIcon(AREA_ICONS[area.scope] ?? 'comment-discussion');
    item.description = this.countsLabel(area.openCount, area.commentCount);
    return item;
  }

  private targetItem(group: TargetGroup): vscode.TreeItem {
    const isCode = group.comments.some(isCodeComment);
    const label = isCode ? path.posix.basename(group.target) : group.target;
    const item = new vscode.TreeItem(label || '(general)', vscode.TreeItemCollapsibleState.Expanded);
    item.id = `target:${group.scope}:${group.target}`;
    item.tooltip = group.target;
    const counts = this.countsLabel(group.openCount, group.comments.length);
    const folder = isCode ? path.posix.dirname(group.target) : '.';
    item.description = folder === '.' ? counts : `${folder} · ${counts}`;
    item.iconPath = isCode ? vscode.ThemeIcon.File : new vscode.ThemeIcon('note');
    item.resourceUri = isCode ? this.codeUri(group.target) : undefined;
    return item;
  }

  private codeUri(relPath: string): vscode.Uri | undefined {
    const snapshot = this.comments.snapshot;
    return snapshot === undefined ? undefined : this.locator.fileUri(snapshot.workspace, snapshot.state, relPath);
  }

  private countsLabel(openCount: number, commentCount: number): string {
    switch (this.filter) {
      case 'open':
        return `${openCount} open`;
      case 'resolved':
        return `${commentCount} resolved`;
      case 'all':
        return `${openCount} open · ${commentCount} total`;
    }
  }
}

class CommentsView implements vscode.Disposable {
  private readonly provider: CommentsTreeProvider;
  private readonly view: vscode.TreeView<CommentsNode>;
  private readonly listener: vscode.Disposable;

  constructor(
    private readonly deps: CommentsTreeDeps,
    private readonly memento: vscode.Memento,
  ) {
    this.provider = new CommentsTreeProvider(deps.comments, deps.locator, storedFilter(memento));
    this.view = vscode.window.createTreeView(COMMENTS_VIEW_ID, { treeDataProvider: this.provider, showCollapseAll: true });
    this.listener = deps.comments.onDidChange(() => this.refresh());
    this.refresh();
  }

  async chooseFilter(): Promise<void> {
    const items = COMMENT_FILTERS.map((filter) => ({
      label: FILTER_LABELS[filter],
      description: filter === this.provider.filter ? 'current' : undefined,
      filter,
    }));
    const picked = await vscode.window.showQuickPick(items, { title: 'Show comments' });
    if (picked !== undefined) {
      this.provider.filter = picked.filter;
      await this.memento.update(FILTER_STATE_KEY, picked.filter);
      this.refresh();
    }
  }

  async open(node: CommentsNode): Promise<void> {
    const comment = requireComment(node);
    if (isCodeComment(comment) && this.deps.controller.hasThread(comment.id)) {
      await this.deps.controller.revealThread(comment.id);
      return;
    }
    const nav = panelNavFor(comment);
    if (nav === undefined) {
      void vscode.window.showInformationMessage(`Comments of the "${comment.scope}" area have no view in the control panel.`);
      return;
    }
    this.deps.panel.createOrShow(nav);
  }

  async reply(node: CommentsNode): Promise<void> {
    const comment = requireComment(node);
    const text = await vscode.window.showInputBox({
      title: `Reply to ${authorLabel(comment.author)}`,
      prompt: summaryOf(comment.text),
      placeHolder: 'Write a reply',
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() === '' ? 'A reply needs some text.' : undefined),
    });
    if (text !== undefined) {
      await this.deps.comments.reply(comment.id, text);
    }
  }

  async setResolved(node: CommentsNode, isResolved: boolean): Promise<void> {
    await this.deps.comments.setResolved(requireComment(node).id, isResolved);
  }

  dispose(): void {
    this.listener.dispose();
    this.view.dispose();
    this.provider.dispose();
  }

  private refresh(): void {
    this.provider.refresh();
    const openCount = countOpenComments(this.deps.comments.byTarget);
    this.view.badge = openCount > 0 ? { value: openCount, tooltip: `${openCount} open comments` } : undefined;
    this.view.description = FILTER_LABELS[this.provider.filter];
    this.view.message = this.emptyMessage();
  }

  private emptyMessage(): string | undefined {
    if (this.deps.comments.snapshot === undefined || this.provider.areas().length > 0) {
      return undefined;
    }
    const filter = this.provider.filter;
    return filter === 'all' ? 'No comments in this workspace yet.' : `No ${filter} comments in this workspace.`;
  }
}

export function registerCommentsView(context: vscode.ExtensionContext, deps: CommentsTreeDeps): void {
  const view = new CommentsView(deps, context.workspaceState);
  context.subscriptions.push(
    view,
    vscode.commands.registerCommand(COMMENTS_FILTER_COMMAND, () => view.chooseFilter()),
    vscode.commands.registerCommand(COMMENTS_OPEN_COMMAND, (node: CommentsNode) => runWithErrorMessage(() => view.open(node))),
    vscode.commands.registerCommand(COMMENTS_REPLY_COMMAND, (node: CommentsNode) => runWithErrorMessage(() => view.reply(node))),
    vscode.commands.registerCommand(COMMENTS_RESOLVE_COMMAND, (node: CommentsNode) =>
      runWithErrorMessage(() => view.setResolved(node, true)),
    ),
    vscode.commands.registerCommand(COMMENTS_UNRESOLVE_COMMAND, (node: CommentsNode) =>
      runWithErrorMessage(() => view.setResolved(node, false)),
    ),
  );
}

function commentItem(comment: ReviewComment): vscode.TreeItem {
  const item = new vscode.TreeItem(summaryOf(comment.text), vscode.TreeItemCollapsibleState.None);
  item.id = `comment:${comment.id}`;
  item.description = commentDetails(comment);
  item.tooltip = commentTooltip(comment);
  item.contextValue = comment.resolved ? RESOLVED_COMMENT_CONTEXT : OPEN_COMMENT_CONTEXT;
  item.iconPath = comment.resolved
    ? new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'))
    : new vscode.ThemeIcon('comment');
  item.command = { command: COMMENTS_OPEN_COMMAND, title: 'Open Comment', arguments: [{ kind: 'comment', comment }] };
  return item;
}

function commentDetails(comment: ReviewComment): string {
  const lines = codePathOf(comment) === undefined ? undefined : lineSpanOf(comment);
  const lineLabel = lines === undefined ? undefined : lines.start === lines.end ? `L${lines.start}` : `L${lines.start}–${lines.end}`;
  const replyCount = comment.replies?.length ?? 0;
  const replies = replyCount === 0 ? undefined : `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
  return [lineLabel, authorLabel(comment.author), replies].filter((part) => part !== undefined).join(' · ');
}

function commentTooltip(comment: ReviewComment): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(`**${authorLabel(comment.author)}** · ${new Date(comment.created_at).toLocaleString()}\n\n`);
  tooltip.appendMarkdown(comment.text);
  return tooltip;
}

function summaryOf(text: string): string {
  const firstLine = text.trim().split(/\r?\n/, 1)[0] ?? '';
  return firstLine.length > SUMMARY_LENGTH ? `${firstLine.slice(0, SUMMARY_LENGTH - 1)}…` : firstLine;
}

function requireComment(node: CommentsNode): ReviewComment {
  if (node.kind !== 'comment') {
    throw new TypeError(`Comment command invoked on a ${node.kind} node.`);
  }
  return node.comment;
}

function storedFilter(memento: vscode.Memento): CommentFilter {
  const stored = memento.get<string>(FILTER_STATE_KEY);
  return COMMENT_FILTERS.find((filter) => filter === stored) ?? 'open';
}
