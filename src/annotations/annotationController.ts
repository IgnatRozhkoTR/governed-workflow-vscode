import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import type { ApiError } from '../api/errors';
import type { CodeAnnotation } from '../api/types';
import type { Settings } from '../config/settings';
import { isModifiedSide } from '../diff/diffSides';
import type { WorkspaceSnapshot } from '../diff/diffView';
import { BASE_FILE_SCHEME, REMOTE_FILE_SCHEME } from '../fs/uris';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import { AnnotationDecorationTypes, buildDecorations, displayedLines, type DocumentLines } from './annotationDecorations';
import { annotationHoverContents, type AnnotationCommandArgs } from './annotationHover';
import { AnnotationStore } from './annotationStore';
import { annotationTargetOf, targetKey, type AnnotationTarget } from './annotationTarget';
import { lineEditsOf } from './lineShift';

const ENABLED_CONTEXT_KEY = 'governedWorkflow.annotationsEnabled';
const POLL_REFRESH_DEBOUNCE_MS = 300;
const ANNOTATED_SCHEMES = ['file', REMOTE_FILE_SCHEME, BASE_FILE_SCHEME];

export interface AnnotationControllerDeps {
  readonly client: ApiClient;
  readonly locator: WorkspaceLocator;
  readonly active: ActiveWorkspace;
  readonly settings: Settings;
}

export interface LocatedAnnotation {
  readonly target: AnnotationTarget;
  readonly annotation: CodeAnnotation;
}

// Annotations are fetched only for visible editors of the active workspace and refreshed on the state poll.
// While a document has unsaved edits its annotations follow the edits locally; the server, which reads the
// file on disk, is asked again once it is saved.
export class AnnotationController implements vscode.Disposable {
  private readonly store: AnnotationStore;
  private readonly decorationTypes = new AnnotationDecorationTypes();
  private readonly expandedIds = new Set<number>();
  private readonly errorLog = vscode.window.createOutputChannel('Governed Workflow Annotations');
  private readonly listeners: vscode.Disposable[];
  private pollRefreshTimer: NodeJS.Timeout | undefined;

  constructor(private readonly deps: AnnotationControllerDeps) {
    this.store = new AnnotationStore(
      (target) => deps.client.listAnnotations(target.workspace, { file: target.filePath, repo: target.repo, ref: target.ref }),
      (target, error) => this.logFetchError(target, error),
    );
    this.listeners = [
      this.store.onDidChange((key) => this.renderEditorsOf(key)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.showVisible()),
      vscode.workspace.onDidChangeTextDocument((event) => this.followEdits(event)),
      vscode.workspace.onDidSaveTextDocument((document) => this.refreshSaved(document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.forget(document)),
      vscode.languages.registerHoverProvider(
        ANNOTATED_SCHEMES.map((scheme) => ({ scheme })),
        { provideHover: (document, position) => this.hoverAt(document, position) },
      ),
      deps.active.onDidChange(() => this.resetWorkspace()),
      deps.active.onDidPoll(() => this.schedulePollRefresh()),
      deps.settings.onDidChange(() => this.applyEnabledSetting()),
    ];
    this.applyEnabledSetting();
  }

  targetOf(document: vscode.TextDocument): AnnotationTarget | undefined {
    const snapshot = this.snapshot();
    return snapshot === undefined ? undefined : annotationTargetOf(document.uri, snapshot, this.deps.locator, isModifiedSide);
  }

  annotationsAt(document: vscode.TextDocument, line: number): CodeAnnotation[] {
    return this.shownIn(document).filter((annotation) => {
      const lines = displayedLines(annotation, document.lineCount);
      return lines !== undefined && lines.start <= line && line <= lines.end;
    });
  }

  locate(args: AnnotationCommandArgs): LocatedAnnotation | undefined {
    const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === args.documentUri);
    const target = document === undefined ? undefined : this.targetOf(document);
    const annotation = target === undefined ? undefined : this.store.get(targetKey(target))?.find((entry) => entry.id === args.annotationId);
    return target === undefined || annotation === undefined ? undefined : { target, annotation };
  }

  isExpanded(annotationId: number): boolean {
    return this.expandedIds.has(annotationId);
  }

  setExpanded(annotationIds: readonly number[], isExpanded: boolean): void {
    annotationIds.forEach((id) => (isExpanded ? this.expandedIds.add(id) : this.expandedIds.delete(id)));
    vscode.window.visibleTextEditors.forEach((editor) => this.render(editor));
  }

  refresh(target: AnnotationTarget): Promise<void> {
    return this.store.request(target);
  }

  dispose(): void {
    clearTimeout(this.pollRefreshTimer);
    this.listeners.forEach((listener) => listener.dispose());
    this.store.dispose();
    this.decorationTypes.dispose();
    this.errorLog.dispose();
  }

  private showVisible(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const target = this.enabledTargetOf(editor.document);
      if (target !== undefined && !this.store.has(targetKey(target))) {
        void this.store.request(target);
      }
      this.render(editor);
    }
  }

  private render(editor: vscode.TextEditor): void {
    const target = this.enabledTargetOf(editor.document);
    const annotations = target === undefined ? undefined : this.store.get(targetKey(target));
    if (annotations === undefined) {
      this.decorationTypes.clear(editor);
      return;
    }
    this.decorationTypes.apply(editor, buildDecorations(annotations, linesOf(editor.document), this.expandedIds));
  }

  private renderEditorsOf(key: string): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const target = this.targetOf(editor.document);
      if (target !== undefined && targetKey(target) === key) {
        this.render(editor);
      }
    }
  }

  private followEdits(event: vscode.TextDocumentChangeEvent): void {
    const target = event.contentChanges.length === 0 ? undefined : this.targetOf(event.document);
    if (target !== undefined) {
      this.store.applyEdits(targetKey(target), lineEditsOf(event.contentChanges));
    }
  }

  private refreshSaved(document: vscode.TextDocument): void {
    const target = this.enabledTargetOf(document);
    if (target !== undefined && this.store.has(targetKey(target))) {
      void this.store.request(target);
    }
  }

  private forget(document: vscode.TextDocument): void {
    const target = this.targetOf(document);
    if (target !== undefined) {
      this.store.forget(targetKey(target));
    }
  }

  private schedulePollRefresh(): void {
    clearTimeout(this.pollRefreshTimer);
    this.pollRefreshTimer = setTimeout(() => this.refreshVisibleSaved(), POLL_REFRESH_DEBOUNCE_MS);
  }

  private refreshVisibleSaved(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const target = editor.document.isDirty ? undefined : this.enabledTargetOf(editor.document);
      if (target !== undefined) {
        void this.store.request(target);
      }
    }
  }

  private hoverAt(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const annotations = this.annotationsAt(document, position.line);
    if (annotations.length === 0) {
      return undefined;
    }
    const uri = document.uri.toString();
    const contents = annotations.flatMap((annotation) => annotationHoverContents(annotation, uri, this.isExpanded(annotation.id)));
    return new vscode.Hover(contents, document.lineAt(position.line).range);
  }

  private resetWorkspace(): void {
    this.store.clear();
    this.expandedIds.clear();
    vscode.window.visibleTextEditors.forEach((editor) => this.decorationTypes.clear(editor));
  }

  private applyEnabledSetting(): void {
    void vscode.commands.executeCommand('setContext', ENABLED_CONTEXT_KEY, this.deps.settings.annotationsEnabled);
    this.showVisible();
  }

  private shownIn(document: vscode.TextDocument): readonly CodeAnnotation[] {
    const target = this.enabledTargetOf(document);
    return (target === undefined ? undefined : this.store.get(targetKey(target))) ?? [];
  }

  private enabledTargetOf(document: vscode.TextDocument): AnnotationTarget | undefined {
    return this.deps.settings.annotationsEnabled ? this.targetOf(document) : undefined;
  }

  private snapshot(): WorkspaceSnapshot | undefined {
    const { ref, state } = this.deps.active;
    return ref === undefined || state === undefined ? undefined : { workspace: ref, state };
  }

  private logFetchError(target: AnnotationTarget, error: ApiError): void {
    const location = target.repo === '' ? target.filePath : `${target.repo}/${target.filePath}`;
    const ref = target.ref === '' ? 'working tree' : target.ref;
    this.errorLog.appendLine(`Annotations of ${location} (${ref}) could not be loaded: ${error.message} [${error.code}]`);
  }
}

function linesOf(document: vscode.TextDocument): DocumentLines {
  return { lineCount: document.lineCount, lengthOf: (line) => document.lineAt(line).text.length };
}
