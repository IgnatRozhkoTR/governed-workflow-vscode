import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { runWithErrorMessage } from '../diff/diffView';
import { AnnotationController, type AnnotationControllerDeps, type LocatedAnnotation } from './annotationController';
import { inlineLabel } from './annotationDecorations';
import {
  DELETE_ANNOTATION_COMMAND,
  EDIT_ANNOTATION_COMMAND,
  TOGGLE_EXPANDED_COMMAND,
  type AnnotationCommandArgs,
} from './annotationHover';
import { isWorkingTreeTarget } from './annotationTarget';

const TOGGLE_VISIBILITY_COMMAND = 'governedWorkflow.annotations.toggleVisibility';
const ADD_ANNOTATION_COMMAND = 'governedWorkflow.annotations.add';
const DELETE_ACTION = 'Delete';

interface SelectedLines {
  readonly lineStart: number;
  readonly lineEnd: number;
}

class AnnotationCommands {
  constructor(
    private readonly controller: AnnotationController,
    private readonly deps: AnnotationControllerDeps,
  ) {}

  toggleExpanded(args?: AnnotationCommandArgs): void {
    if (args !== undefined) {
      this.controller.setExpanded([args.annotationId], !this.controller.isExpanded(args.annotationId));
      return;
    }
    const editor = vscode.window.activeTextEditor;
    const ids = editor === undefined ? [] : this.controller.annotationsAt(editor.document, editor.selection.active.line).map((entry) => entry.id);
    if (ids.length === 0) {
      void vscode.window.showInformationMessage('There is no annotation on this line.');
      return;
    }
    this.controller.setExpanded(ids, !ids.every((id) => this.controller.isExpanded(id)));
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
    const text = await askForText(`Annotate ${linesLabel(lines)}`, '');
    if (text === undefined) {
      return;
    }
    const { repo, filePath, workspace } = target;
    await this.deps.client.createAnnotation(workspace, { repo, file_path: filePath, line_start: lines.lineStart, line_end: lines.lineEnd, text });
    await this.controller.refresh(target);
  }

  async edit(args: AnnotationCommandArgs): Promise<void> {
    const located = this.requireAnnotation(args);
    const text = located === undefined ? undefined : await askForText('Edit annotation', located.annotation.text);
    if (located === undefined || text === undefined || text === located.annotation.text) {
      return;
    }
    await this.deps.client.updateAnnotation(located.target.workspace, args.annotationId, { text });
    await this.controller.refresh(located.target);
  }

  async delete(args: AnnotationCommandArgs): Promise<void> {
    const located = this.requireAnnotation(args);
    if (located === undefined) {
      return;
    }
    const detail = inlineLabel({ ...located.annotation, stale: false }, false);
    const choice = await vscode.window.showWarningMessage('Delete this annotation?', { modal: true, detail }, DELETE_ACTION);
    if (choice !== DELETE_ACTION) {
      return;
    }
    await this.deps.client.deleteAnnotation(located.target.workspace, args.annotationId);
    this.controller.setExpanded([args.annotationId], false);
    await this.controller.refresh(located.target);
  }

  private requireAnnotation(args: AnnotationCommandArgs): LocatedAnnotation | undefined {
    const located = this.controller.locate(args);
    if (located === undefined) {
      void vscode.window.showWarningMessage('This annotation is no longer shown. Hover it again after the editor refreshes.');
    }
    return located;
  }
}

export function registerAnnotations(context: vscode.ExtensionContext, deps: AnnotationControllerDeps): void {
  const controller = new AnnotationController(deps);
  const commands = new AnnotationCommands(controller, deps);
  context.subscriptions.push(
    controller,
    vscode.commands.registerCommand(TOGGLE_EXPANDED_COMMAND, (args?: AnnotationCommandArgs) => commands.toggleExpanded(args)),
    vscode.commands.registerCommand(TOGGLE_VISIBILITY_COMMAND, () => commands.toggleVisibility()),
    vscode.commands.registerCommand(ADD_ANNOTATION_COMMAND, () => runWithErrorMessage(() => commands.add())),
    vscode.commands.registerCommand(EDIT_ANNOTATION_COMMAND, (args: AnnotationCommandArgs) => runWithErrorMessage(() => commands.edit(args))),
    vscode.commands.registerCommand(DELETE_ANNOTATION_COMMAND, (args: AnnotationCommandArgs) => runWithErrorMessage(() => commands.delete(args))),
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

async function askForText(title: string, value: string): Promise<string | undefined> {
  const text = await vscode.window.showInputBox({
    title,
    value,
    prompt: 'An explanatory note shown next to the code (Markdown in the hover)',
    ignoreFocusOut: true,
    validateInput: (input) => (input.trim() === '' ? 'The annotation text is required.' : undefined),
  });
  return text?.trim();
}
