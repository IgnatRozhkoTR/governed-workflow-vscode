import * as vscode from 'vscode';
import type { WorkspaceSnapshot } from '../diff/diffView';
import { BASE_FILE_SCHEME } from '../fs/uris';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import { branchBaseUri, documentLineHashes, filePresence, isAnchoredAt, isAnchoredInWorkingTree } from './baseSideAnchor';
import { placeLines, threadSignature, type CodeThread } from './commentMapping';
import { commentPathOf } from './commentPaths';
import { applyResolvedState, outdatedLabel, threadComments, toEditorRange } from './threadPresentation';

const FIRST_LINE = { start: 1, end: 1 };

interface ThreadEntry {
  readonly thread: vscode.CommentThread;
  code: CodeThread;
  signature: string;
  readonly isPinnedToSideUri: boolean;
}

// Keeps one editor thread per root comment and updates it in place, so polling never makes threads blink or duplicate.
export class CodeThreadSet implements vscode.Disposable {
  private readonly entries = new Map<number, ThreadEntry>();
  private readonly baseSideChecks = new Set<string>();
  private readonly missingFileUris = new Set<string>();
  private readonly presenceChecks = new Map<string, Promise<void>>();
  private snapshot: WorkspaceSnapshot | undefined;

  constructor(
    private readonly controller: vscode.CommentController,
    private readonly locator: WorkspaceLocator,
  ) {}

  sync(snapshot: WorkspaceSnapshot | undefined, threads: readonly CodeThread[]): void {
    this.snapshot = snapshot;
    if (snapshot === undefined) {
      this.removeAllExcept(new Set());
      this.missingFileUris.clear();
      return;
    }
    for (const code of threads) {
      this.upsert(this.canonicalUri(snapshot, code.filePath), code);
    }
    this.removeAllExcept(new Set(threads.map((code) => code.root.id)));
    this.moveThreadsOfMissingFiles();
    vscode.workspace.textDocuments.forEach((document) => this.placeIn(document));
    void warnOnFailure('Cannot place comments on deleted files', this.checkWorkingFilesPresence());
  }

  canonicalUri(snapshot: WorkspaceSnapshot, filePath: string): vscode.Uri {
    return this.locator.fileUri(snapshot.workspace, snapshot.state, filePath);
  }

  adopt(draft: vscode.CommentThread, code: CodeThread, canonicalUri: vscode.Uri): void {
    if (this.entries.has(code.root.id)) {
      draft.dispose();
      return;
    }
    const isPinned = draft.uri.toString() !== canonicalUri.toString();
    this.entries.set(code.root.id, this.present(draft, code, isPinned));
  }

  rootIdOf(thread: vscode.CommentThread): number | undefined {
    for (const [rootId, entry] of this.entries) {
      if (entry.thread === thread) {
        return rootId;
      }
    }
    return undefined;
  }

  filePathOf(thread: vscode.CommentThread): string | undefined {
    const rootId = this.rootIdOf(thread);
    return rootId === undefined ? undefined : this.entries.get(rootId)?.code.filePath;
  }

  // Applied right after the server accepted the change, so the thread flips without waiting for the next poll;
  // the next sync still brings the server's resolution label.
  markResolved(rootIds: readonly number[], isResolved: boolean): void {
    for (const rootId of rootIds) {
      const entry = this.entries.get(rootId);
      if (entry !== undefined && entry.code.root.resolved !== isResolved) {
        entry.code = { ...entry.code, root: { ...entry.code.root, resolved: isResolved } };
        entry.signature = threadSignature(entry.code);
        applyResolvedState(entry.thread, isResolved);
      }
    }
  }

  hasThread(rootId: number): boolean {
    return this.entries.has(rootId);
  }

  placeIn(document: vscode.TextDocument): void {
    if (document.uri.scheme === BASE_FILE_SCHEME) {
      void warnOnFailure(`Cannot place comments on ${document.uri.path}`, this.claimOldSideThreads(document));
    }
    this.placeEntriesIn(document);
  }

  async reveal(rootId: number): Promise<boolean> {
    const found = this.entries.get(rootId);
    if (found === undefined) {
      return false;
    }
    if (!found.isPinnedToSideUri) {
      await this.checkPresence(found.thread.uri);
    }
    const entry = this.entries.get(rootId);
    const document = entry === undefined ? undefined : await openDocument(entry);
    if (document === undefined) {
      return false;
    }
    this.placeIn(document);
    return this.showThread(rootId, document);
  }

  dispose(): void {
    this.removeAllExcept(new Set());
  }

  private async showThread(rootId: number, document: vscode.TextDocument): Promise<boolean> {
    const entry = this.entries.get(rootId);
    if (entry === undefined) {
      return false;
    }
    const start = entry.thread.range?.start ?? new vscode.Position(0, 0);
    await vscode.window.showTextDocument(document, { preview: false, selection: new vscode.Selection(start, start) });
    entry.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    return true;
  }

  // Threads whose stored line is only found on the base side move to the base document, so old-side
  // comments stay on the old side after a reload.
  private async claimOldSideThreads(document: vscode.TextDocument): Promise<void> {
    const filePath = this.snapshot === undefined ? undefined : commentPathOf(document.uri, this.snapshot, this.locator);
    if (filePath === undefined) {
      return;
    }
    const baseHashes = documentLineHashes(document);
    for (const entry of this.takeUncheckedEntries(filePath, document.uri)) {
      if (isAnchoredAt(entry.code, baseHashes) && !(await isAnchoredInWorkingTree(entry.thread.uri, entry.code))) {
        this.moveUnpinned(entry.code.root.id, document.uri);
      }
    }
    this.placeEntriesIn(document);
  }

  private takeUncheckedEntries(filePath: string, baseUri: vscode.Uri): ThreadEntry[] {
    const keyOf = (entry: ThreadEntry): string => `${entry.code.root.id}|${baseUri.toString()}`;
    const unchecked = [...this.entries.values()].filter(
      (entry) => !entry.isPinnedToSideUri && entry.code.filePath === filePath && !this.baseSideChecks.has(keyOf(entry)),
    );
    unchecked.forEach((entry) => this.baseSideChecks.add(keyOf(entry)));
    return unchecked;
  }

  private placeEntriesIn(document: vscode.TextDocument): void {
    const documentUri = document.uri.toString();
    const matching = [...this.entries.values()].filter((entry) => entry.thread.uri.toString() === documentUri);
    if (matching.length === 0) {
      return;
    }
    const hashes = documentLineHashes(document);
    matching.forEach((entry) => placeEntry(entry, hashes));
  }

  private upsert(uri: vscode.Uri, code: CodeThread): void {
    const existing = this.entries.get(code.root.id);
    if (existing !== undefined && (existing.isPinnedToSideUri || existing.thread.uri.toString() === uri.toString())) {
      updateEntry(existing, code);
      return;
    }
    existing?.thread.dispose();
    const thread = this.controller.createCommentThread(uri, toEditorRange(code.lines ?? FIRST_LINE), []);
    this.entries.set(code.root.id, this.present(thread, code, false));
  }

  // A missing working-tree file is remembered, so threads arriving in later polls go straight to the
  // base document. Present files are asked again on later syncs because the branch may delete them;
  // a failed check says nothing, so it is simply retried on the next sync.
  private async checkWorkingFilesPresence(): Promise<void> {
    await Promise.all(this.uncheckedWorkingFileUris().map((uri) => this.checkPresence(uri)));
  }

  private uncheckedWorkingFileUris(): vscode.Uri[] {
    const byKey = new Map<string, vscode.Uri>();
    for (const entry of this.entries.values()) {
      const uriKey = entry.thread.uri.toString();
      if (!entry.isPinnedToSideUri && !this.missingFileUris.has(uriKey) && !this.presenceChecks.has(uriKey)) {
        byKey.set(uriKey, entry.thread.uri);
      }
    }
    return [...byKey.values()];
  }

  private checkPresence(uri: vscode.Uri): Promise<void> {
    const uriKey = uri.toString();
    const running = this.presenceChecks.get(uriKey);
    if (running !== undefined) {
      return running;
    }
    const check = this.recordPresence(uri, uriKey);
    this.presenceChecks.set(uriKey, check);
    return check;
  }

  private async recordPresence(uri: vscode.Uri, uriKey: string): Promise<void> {
    try {
      if ((await filePresence(uri)) === 'missing') {
        this.missingFileUris.add(uriKey);
        this.moveThreadsOfMissingFiles();
      }
    } finally {
      this.presenceChecks.delete(uriKey);
    }
  }

  private moveThreadsOfMissingFiles(): void {
    const snapshot = this.snapshot;
    const stranded = [...this.entries.values()].filter(
      (entry) => !entry.isPinnedToSideUri && this.missingFileUris.has(entry.thread.uri.toString()),
    );
    if (snapshot === undefined || stranded.length === 0) {
      return;
    }
    stranded.forEach((entry) => this.moveToBranchBase(snapshot, entry.code));
    vscode.workspace.textDocuments.forEach((document) => this.placeEntriesIn(document));
  }

  private moveToBranchBase(snapshot: WorkspaceSnapshot, code: CodeThread): void {
    const baseUri = branchBaseUri(snapshot, code.filePath);
    if (baseUri !== undefined) {
      this.moveUnpinned(code.root.id, baseUri);
    }
  }

  private moveUnpinned(rootId: number, uri: vscode.Uri): void {
    const entry = this.entries.get(rootId);
    if (entry === undefined || entry.isPinnedToSideUri) {
      return;
    }
    entry.thread.dispose();
    const thread = this.controller.createCommentThread(uri, toEditorRange(entry.code.lines ?? FIRST_LINE), []);
    this.entries.set(rootId, this.present(thread, entry.code, true));
  }

  private present(thread: vscode.CommentThread, code: CodeThread, isPinnedToSideUri: boolean): ThreadEntry {
    thread.comments = threadComments(code);
    thread.canReply = true;
    applyResolvedState(thread, code.root.resolved);
    setRange(thread, code.lines === undefined ? undefined : toEditorRange(code.lines));
    return { thread, code, signature: threadSignature(code), isPinnedToSideUri };
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

async function warnOnFailure(message: string, task: Promise<void>): Promise<void> {
  try {
    await task;
  } catch (error) {
    warn(message, error);
  }
}

function warn(message: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  void vscode.window.showWarningMessage(`${message}: ${reason}`);
}

async function openDocument(entry: ThreadEntry): Promise<vscode.TextDocument | undefined> {
  try {
    return await vscode.workspace.openTextDocument(entry.thread.uri);
  } catch (error) {
    warn(`Cannot open ${entry.code.filePath}`, error);
    return undefined;
  }
}
