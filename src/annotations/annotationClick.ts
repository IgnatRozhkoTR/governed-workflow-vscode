import * as vscode from 'vscode';
import type { CodeAnnotation } from '../api/types';
import { displayedLines, linesOf, type DocumentLines } from './annotationDecorations';
import type { AnnotationThreads } from './annotationThreads';

type Caret = Pick<vscode.Selection, 'anchor' | 'active'>;

// Decoration text is not clickable, and an inlay hint command needs Ctrl/Cmd+click. The inline note is drawn
// past the last character of its line, so a mouse click on it leaves an empty caret at the end of that line.
export function annotationsClickedAt<T extends Pick<CodeAnnotation, 'line_start' | 'line_end'>>(
  annotations: readonly T[],
  document: DocumentLines,
  caret: Caret,
): T[] {
  const { anchor, active } = caret;
  const isEmptyCaret = anchor.line === active.line && anchor.character === active.character;
  if (!isEmptyCaret || active.line >= document.lineCount || active.character !== document.lengthOf(active.line)) {
    return [];
  }
  return annotations.filter((annotation) => displayedLines(annotation, document.lineCount)?.end === active.line);
}

// A click that leaves the caret where it already is fires no selection event, so the next click on the note would
// go unnoticed. Moving the caret off the end of the line after each toggle makes the next click a real change; the
// move is programmatic, so it is not a Mouse selection and does not toggle again.
export function toggleClickedAnnotations(
  editor: Pick<vscode.TextEditor, 'document' | 'selection'>,
  shown: readonly CodeAnnotation[],
  threads: Pick<AnnotationThreads, 'toggle'>,
): void {
  const document = editor.document;
  const lines = linesOf(document);
  const clicked = annotationsClickedAt(shown, lines, editor.selection);
  if (clicked.length === 0) {
    return;
  }
  threads.toggle(document, clicked);
  const caretLine = editor.selection.active.line;
  const target = positionOffLineEnd(document, lines, caretLine);
  editor.selection = new vscode.Selection(target, target);
}

function positionOffLineEnd(document: Pick<vscode.TextDocument, 'lineAt'>, lines: DocumentLines, line: number): vscode.Position {
  const length = lines.lengthOf(line);
  if (length === 0) {
    const neighbour = line > 0 ? line - 1 : Math.min(line + 1, lines.lineCount - 1);
    return new vscode.Position(neighbour, 0);
  }
  const firstText = document.lineAt(line).firstNonWhitespaceCharacterIndex;
  return new vscode.Position(line, firstText < length ? firstText : 0);
}
