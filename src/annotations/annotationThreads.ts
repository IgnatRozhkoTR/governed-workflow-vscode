import * as vscode from 'vscode';
import type { CodeAnnotation } from '../api/types';
import { displayedLines } from './annotationDecorations';

export const ANNOTATION_CONTROLLER_ID = 'governedWorkflow.annotations';
export const ANNOTATION_CONTROLLER_LABEL = 'Annotations';
const THREAD_LABEL_PREFIX = 'Annotation · ';
const STALE_LABEL = 'Stale: the annotated lines changed';
const EDITED_LABEL = 'Edited';

type AnnotationThreadController = Pick<vscode.CommentController, 'createCommentThread' | 'dispose'>;
type AnnotatedDocument = Pick<vscode.TextDocument, 'uri' | 'lineCount'>;

// The note is untrusted Markdown: no command links, no raw HTML.
export class AnnotationComment implements vscode.Comment {
  body: vscode.MarkdownString | string = '';
  mode: vscode.CommentMode = vscode.CommentMode.Preview;
  author: vscode.CommentAuthorInformation = { name: '' };
  timestamp: Date | undefined;
  label: string | undefined;
  private annotation: CodeAnnotation;

  constructor(
    readonly ref: AnnotationCommandArgs,
    annotation: CodeAnnotation,
  ) {
    this.annotation = annotation;
    this.show(annotation);
  }

  get isEditing(): boolean {
    return this.mode === vscode.CommentMode.Editing;
  }

  get savedText(): string {
    return this.annotation.text;
  }

  get editedText(): string {
    return (typeof this.body === 'string' ? this.body : this.body.value).trim();
  }

  startEditing(): void {
    this.mode = vscode.CommentMode.Editing;
  }

  show(annotation: CodeAnnotation): void {
    this.annotation = annotation;
    this.body = noteBody(annotation.text);
    this.mode = vscode.CommentMode.Preview;
    this.author = { name: annotation.author };
    this.timestamp = new Date(annotation.created_at);
    this.label = annotation.stale ? STALE_LABEL : annotation.updated_at !== annotation.created_at ? EDITED_LABEL : undefined;
  }

  restore(): void {
    this.show(this.annotation);
  }
}

interface OpenAnnotation {
  readonly thread: vscode.CommentThread;
  readonly comment: AnnotationComment;
}

// A comment thread exists only while its annotation is open, so closed notes never fill the Comments panel.
export interface AnnotationCommandArgs {
  readonly documentUri: string;
  readonly annotationId: number;
}

export class AnnotationThreads implements vscode.Disposable {
  private readonly opened = new Map<string, OpenAnnotation>();

  constructor(private readonly controller: AnnotationThreadController) {}

  isOpen(ref: AnnotationCommandArgs): boolean {
    return this.opened.has(openKey(ref));
  }

  // Several notes ending on one line act together: all of them open unless every one already is.
  toggle(document: AnnotatedDocument, annotations: readonly CodeAnnotation[]): void {
    const refs = annotations.map((annotation) => refOf(document, annotation));
    if (refs.length > 0 && refs.every((ref) => this.isOpen(ref))) {
      refs.forEach((ref) => this.close(ref));
      return;
    }
    annotations.forEach((annotation) => this.open(document, annotation));
  }

  open(document: AnnotatedDocument, annotation: CodeAnnotation): void {
    const ref = refOf(document, annotation);
    const lines = displayedLines(annotation, document.lineCount);
    if (lines === undefined || this.isOpen(ref)) {
      return;
    }
    const comment = new AnnotationComment(ref, annotation);
    const thread = this.controller.createCommentThread(document.uri, rangeOf(lines), [comment]);
    thread.canReply = false;
    thread.label = `${THREAD_LABEL_PREFIX}${annotation.author}`;
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    this.opened.set(openKey(ref), { thread, comment });
  }

  close(ref: AnnotationCommandArgs): void {
    const key = openKey(ref);
    this.opened.get(key)?.thread.dispose();
    this.opened.delete(key);
  }

  closeThread(thread: vscode.CommentThread): void {
    [...this.opened.values()].filter((entry) => entry.thread === thread).forEach((entry) => this.close(entry.comment.ref));
  }

  closeDocument(documentUri: string): void {
    this.openIn(documentUri).forEach((entry) => this.close(entry.comment.ref));
  }

  closeAll(): void {
    this.opened.forEach((entry) => entry.thread.dispose());
    this.opened.clear();
  }

  // Open threads follow the shown annotations: they move with their lines, take refreshed text, and close
  // when their annotation is gone or annotations are no longer shown in the document. A note being edited
  // is not re-sent, since that would replace the text typed so far; it keeps the annotation it was opened with.
  sync(document: AnnotatedDocument, annotations: readonly CodeAnnotation[] | undefined): void {
    for (const entry of this.openIn(document.uri.toString())) {
      const annotation = annotations?.find((candidate) => candidate.id === entry.comment.ref.annotationId);
      const lines = annotation === undefined ? undefined : displayedLines(annotation, document.lineCount);
      if (annotation === undefined || lines === undefined) {
        this.close(entry.comment.ref);
        continue;
      }
      moveThread(entry.thread, rangeOf(lines));
      entry.thread.label = `${THREAD_LABEL_PREFIX}${annotation.author}`;
      if (!entry.comment.isEditing) {
        entry.comment.show(annotation);
        rerender(entry);
      }
    }
  }

  beginEdit(comment: AnnotationComment): void {
    this.withOpen(comment, (entry) => entry.comment.startEditing());
  }

  cancelEdit(comment: AnnotationComment): void {
    this.withOpen(comment, (entry) => entry.comment.restore());
  }

  finishEdit(comment: AnnotationComment, saved: CodeAnnotation): void {
    this.withOpen(comment, (entry) => entry.comment.show(saved));
  }

  dispose(): void {
    this.closeAll();
    this.controller.dispose();
  }

  private withOpen(comment: AnnotationComment, change: (entry: OpenAnnotation) => void): void {
    const entry = this.opened.get(openKey(comment.ref));
    if (entry !== undefined) {
      change(entry);
      rerender(entry);
    }
  }

  private openIn(documentUri: string): OpenAnnotation[] {
    return [...this.opened.values()].filter((entry) => entry.comment.ref.documentUri === documentUri);
  }
}

function refOf(document: AnnotatedDocument, annotation: CodeAnnotation): AnnotationCommandArgs {
  return { documentUri: document.uri.toString(), annotationId: annotation.id };
}

function openKey(ref: AnnotationCommandArgs): string {
  return `${ref.documentUri}\u0000${ref.annotationId}`;
}

function rangeOf(lines: { readonly start: number; readonly end: number }): vscode.Range {
  return new vscode.Range(lines.start, 0, lines.end, 0);
}

function moveThread(thread: vscode.CommentThread, range: vscode.Range): void {
  if (thread.range === undefined || !thread.range.isEqual(range)) {
    thread.range = range;
  }
}

// VS Code picks up a changed comment only when the thread's comments array is assigned again.
function rerender(entry: OpenAnnotation): void {
  entry.thread.comments = [entry.comment];
}

function noteBody(text: string): vscode.MarkdownString {
  const body = new vscode.MarkdownString(text);
  body.isTrusted = false;
  body.supportHtml = false;
  return body;
}
