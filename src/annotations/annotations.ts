import * as vscode from 'vscode';
import { runWithErrorMessage } from '../diff/diffView';
import { AnnotationController, type AnnotationControllerDeps, type LocatedAnnotation } from './annotationController';
import { isWorkingTreeTarget } from './annotationTarget';
import { ANNOTATION_CONTROLLER_ID, ANNOTATION_CONTROLLER_LABEL, AnnotationThreads, type AnnotationCommandArgs, type AnnotationComment } from './annotationThreads';
import { markdownToPlainPreview } from './plainPreview';

export const EDIT_ANNOTATION_COMMAND = 'governedWorkflow.annotations.edit';
export const SAVE_ANNOTATION_COMMAND = 'governedWorkflow.annotations.saveEdit';
export const CANCEL_ANNOTATION_EDIT_COMMAND = 'governedWorkflow.annotations.cancelEdit';
export const DELETE_ANNOTATION_COMMAND = 'governedWorkflow.annotations.delete';
export const CLOSE_ANNOTATION_COMMAND = 'governedWorkflow.annotations.close';
export const TOGGLE_EXPANDED_COMMAND = 'governedWorkflow.annotations.toggleExpanded';
const TOGGLE_VISIBILITY_COMMAND = 'governedWorkflow.annotations.toggleVisibility';
const ADD_ANNOTATION_COMMAND = 'governedWorkflow.annotations.add';
const DELETE_ACTION = 'Delete';
const TEXT_REQUIRED = 'The annotation text is required.';

export type AnnotationLookup = Pick<AnnotationController, 'targetOf' | 'annotationsAt' | 'locate' | 'refresh'>;
export type AnnotationCommandDeps = Pick<AnnotationControllerDeps, 'client' | 'settings'>;

interface SelectedLines {
  readonly lineStart: number;
  readonly lineEnd: number;
}

export class AnnotationCommands {
  constructor(
    private readonly controller: AnnotationLookup,
    private readonly threads: AnnotationThreads,
    private readonly deps: AnnotationCommandDeps,
  ) {}

  toggleOpen(args?: AnnotationCommandArgs): void {
    if (args !== undefined) {
      const located = this.requireAnnotation(args);
      if (located !== undefined) {
        this.threads.toggle(located.document, [located.annotation]);
      }
      return;
    }
    const editor = vscode.window.activeTextEditor;
    const annotations = editor === undefined ? [] : this.controller.annotationsAt(editor.document, editor.selection.active.line);
    if (editor === undefined || annotations.length === 0) {
      void vscode.window.showInformationMessage('There is no annotation on this line.');
      return;
    }
    this.threads.toggle(editor.document, annotations);
  }

  toggleVisibility(): Promise<void> {
    return this.deps.settings.setAnnotationsEnabled(!this.deps.settings.annotationsEnabled);
  }

  async add(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const target = editor === undefined ? undefined : this.controller.targetOf(editor.document);
    if (editor === undefined || target === undefined || !isWorkingTreeTarget(target)) {
      void vscode.window.showWarningMessage('Annotations can be added to working tree files of the active workspace only.');
      return;
    }
    if (editor.document.isDirty) {
      void vscode.window.showWarningMessage('Save the file first: the admin panel anchors annotations to the file on disk.');
      return;
    }
    const lines = selectedLines(editor.selection);
    const text = await askForText(`Annotate ${linesLabel(lines)}`);
    if (text === undefined) {
      return;
    }
    const { repo, filePath, workspace } = target;
    await this.deps.client.createAnnotation(workspace, { repo, file_path: filePath, line_start: lines.lineStart, line_end: lines.lineEnd, text });
    await this.controller.refresh(target);
  }

  edit(comment: AnnotationComment): void {
    this.threads.beginEdit(comment);
  }

  cancelEdit(comment: AnnotationComment): void {
    this.threads.cancelEdit(comment);
  }

  // A failed save leaves the note in edit mode with the typed text, so it can be saved again.
  async saveEdit(comment: AnnotationComment): Promise<void> {
    const text = comment.editedText;
    if (text === '') {
      void vscode.window.showWarningMessage(TEXT_REQUIRED);
      return;
    }
    if (text === comment.savedText) {
      this.threads.cancelEdit(comment);
      return;
    }
    const located = this.requireAnnotation(comment.ref);
    if (located === undefined) {
      return;
    }
    const saved = await this.deps.client.updateAnnotation(located.target.workspace, comment.ref.annotationId, { text });
    this.threads.finishEdit(comment, saved);
    await this.controller.refresh(located.target);
  }

  async delete(comment: AnnotationComment): Promise<void> {
    const located = this.requireAnnotation(comment.ref);
    if (located === undefined) {
      return;
    }
    const detail = markdownToPlainPreview(located.annotation.text);
    const choice = await vscode.window.showWarningMessage('Delete this annotation?', { modal: true, detail }, DELETE_ACTION);
    if (choice !== DELETE_ACTION) {
      return;
    }
    await this.deps.client.deleteAnnotation(located.target.workspace, comment.ref.annotationId);
    this.threads.close(comment.ref);
    await this.controller.refresh(located.target);
  }

  close(thread: vscode.CommentThread): void {
    this.threads.closeThread(thread);
  }

  private requireAnnotation(args: AnnotationCommandArgs): LocatedAnnotation | undefined {
    const located = this.controller.locate(args);
    if (located === undefined) {
      void vscode.window.showWarningMessage('This annotation is no longer shown. Open it again after the editor refreshes.');
    }
    return located;
  }
}

export function registerAnnotations(context: vscode.ExtensionContext, deps: AnnotationControllerDeps): void {
  const threads = new AnnotationThreads(vscode.comments.createCommentController(ANNOTATION_CONTROLLER_ID, ANNOTATION_CONTROLLER_LABEL));
  const controller = new AnnotationController(deps, threads);
  const commands = new AnnotationCommands(controller, threads, deps);
  context.subscriptions.push(
    controller,
    threads,
    vscode.commands.registerCommand(TOGGLE_EXPANDED_COMMAND, (args?: AnnotationCommandArgs) => commands.toggleOpen(args)),
    vscode.commands.registerCommand(TOGGLE_VISIBILITY_COMMAND, () => commands.toggleVisibility()),
    vscode.commands.registerCommand(ADD_ANNOTATION_COMMAND, () => runWithErrorMessage(() => commands.add())),
    vscode.commands.registerCommand(EDIT_ANNOTATION_COMMAND, (comment: AnnotationComment) => commands.edit(comment)),
    vscode.commands.registerCommand(CANCEL_ANNOTATION_EDIT_COMMAND, (comment: AnnotationComment) => commands.cancelEdit(comment)),
    vscode.commands.registerCommand(SAVE_ANNOTATION_COMMAND, (comment: AnnotationComment) => runWithErrorMessage(() => commands.saveEdit(comment))),
    vscode.commands.registerCommand(DELETE_ANNOTATION_COMMAND, (comment: AnnotationComment) => runWithErrorMessage(() => commands.delete(comment))),
    vscode.commands.registerCommand(CLOSE_ANNOTATION_COMMAND, (thread: vscode.CommentThread) => commands.close(thread)),
  );
}

// A selection ending at column 0 of a line does not include that line.
export function selectedLines(selection: Pick<vscode.Selection, 'start' | 'end'>): SelectedLines {
  const { start, end } = selection;
  const lastLine = end.line > start.line && end.character === 0 ? end.line - 1 : end.line;
  return { lineStart: start.line + 1, lineEnd: lastLine + 1 };
}

function linesLabel(lines: SelectedLines): string {
  return lines.lineStart === lines.lineEnd ? `line ${lines.lineStart}` : `lines ${lines.lineStart}–${lines.lineEnd}`;
}

async function askForText(title: string): Promise<string | undefined> {
  const text = await vscode.window.showInputBox({
    title,
    prompt: 'An explanatory note shown next to the code (Markdown supported)',
    ignoreFocusOut: true,
    validateInput: (input) => (input.trim() === '' ? TEXT_REQUIRED : undefined),
  });
  return text?.trim();
}
