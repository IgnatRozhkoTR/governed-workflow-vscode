import * as vscode from 'vscode';
import type { WorkspaceSnapshot } from '../diff/diffView';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import { hashLines, placeLines, threadSignature, type CodeThread } from './commentMapping';
import { applyResolvedState, outdatedLabel, threadComments, toEditorRange } from './threadPresentation';

const LINE_BREAK = /\r\n|\r|\n/;
const FIRST_LINE = { start: 1, end: 1 };

interface ThreadEntry {
  readonly thread: vscode.CommentThread;
  code: CodeThread;
  signature: string;
}

// Keeps one editor thread per root comment and updates it in place, so polling never makes threads blink or duplicate.
export class CodeThreadSet implements vscode.Disposable {
  private readonly entries = new Map<number, ThreadEntry>();

  constructor(
    private readonly controller: vscode.CommentController,
    private readonly locator: WorkspaceLocator,
  ) {}

  sync(snapshot: WorkspaceSnapshot | undefined, threads: readonly CodeThread[]): void {
    if (snapshot === undefined) {
      this.removeAllExcept(new Set());
      return;
    }
    for (const code of threads) {
      this.upsert(this.canonicalUri(snapshot, code.filePath), code);
    }
    this.removeAllExcept(new Set(threads.map((code) => code.root.id)));
    vscode.workspace.textDocuments.forEach((document) => this.placeIn(document));
  }

  canonicalUri(snapshot: WorkspaceSnapshot, filePath: string): vscode.Uri {
    return this.locator.fileUri(snapshot.workspace, snapshot.state, filePath);
  }

  adopt(draft: vscode.CommentThread, code: CodeThread, canonicalUri: vscode.Uri): void {
    if (this.entries.has(code.root.id) || draft.uri.toString() !== canonicalUri.toString()) {
      draft.dispose();
      return;
    }
    this.entries.set(code.root.id, this.present(draft, code));
  }

  rootIdOf(thread: vscode.CommentThread): number | undefined {
    for (const [rootId, entry] of this.entries) {
      if (entry.thread === thread) {
        return rootId;
      }
    }
    return undefined;
  }

  hasThread(rootId: number): boolean {
    return this.entries.has(rootId);
  }

  placeIn(document: vscode.TextDocument): void {
    const documentUri = document.uri.toString();
    const matching = [...this.entries.values()].filter((entry) => entry.thread.uri.toString() === documentUri);
    if (matching.length === 0) {
      return;
    }
    const hashes = hashLines(document.getText().split(LINE_BREAK));
    matching.forEach((entry) => placeEntry(entry, hashes));
  }

  async reveal(rootId: number): Promise<void> {
    const entry = this.entries.get(rootId);
    if (entry === undefined) {
      return;
    }
    const document = await openDocument(entry);
    if (document === undefined) {
      return;
    }
    this.placeIn(document);
    const start = entry.thread.range?.start ?? new vscode.Position(0, 0);
    await vscode.window.showTextDocument(document, { preview: false, selection: new vscode.Selection(start, start) });
    entry.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
  }

  dispose(): void {
    this.removeAllExcept(new Set());
  }

  private upsert(uri: vscode.Uri, code: CodeThread): void {
    const existing = this.entries.get(code.root.id);
    if (existing !== undefined && existing.thread.uri.toString() === uri.toString()) {
      updateEntry(existing, code);
      return;
    }
    existing?.thread.dispose();
    const thread = this.controller.createCommentThread(uri, toEditorRange(code.lines ?? FIRST_LINE), []);
    this.entries.set(code.root.id, this.present(thread, code));
  }

  private present(thread: vscode.CommentThread, code: CodeThread): ThreadEntry {
    thread.comments = threadComments(code);
    thread.canReply = true;
    applyResolvedState(thread, code.root.resolved);
    setRange(thread, code.lines === undefined ? undefined : toEditorRange(code.lines));
    return { thread, code, signature: threadSignature(code) };
  }

  private removeAllExcept(liveIds: ReadonlySet<number>): void {
    for (const [rootId, entry] of this.entries) {
      if (!liveIds.has(rootId)) {
        entry.thread.dispose();
        this.entries.delete(rootId);
      }
    }
  }
}

function updateEntry(entry: ThreadEntry, code: CodeThread): void {
  const signature = threadSignature(code);
  if (signature === entry.signature) {
    return;
  }
  entry.thread.comments = threadComments(code);
  if (code.root.resolved !== entry.code.root.resolved) {
    applyResolvedState(entry.thread, code.root.resolved);
  }
  entry.code = code;
  entry.signature = signature;
}

function placeEntry(entry: ThreadEntry, documentHashes: readonly string[]): void {
  const { lines, root } = entry.code;
  if (lines === undefined) {
    return;
  }
  const placement = placeLines(lines, root.line_hash, documentHashes);
  setRange(entry.thread, toEditorRange(placement.lines));
  const label = outdatedLabel(placement.isOutdated);
  if (entry.thread.label !== label) {
    entry.thread.label = label;
  }
}

function setRange(thread: vscode.CommentThread, range: vscode.Range | undefined): void {
  const isSame = range === undefined ? thread.range === undefined : thread.range?.isEqual(range) === true;
  if (!isSame) {
    thread.range = range;
  }
}

async function openDocument(entry: ThreadEntry): Promise<vscode.TextDocument | undefined> {
  try {
    return await vscode.workspace.openTextDocument(entry.thread.uri);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    void vscode.window.showWarningMessage(`Cannot open ${entry.code.filePath}: ${reason}`);
    return undefined;
  }
}
