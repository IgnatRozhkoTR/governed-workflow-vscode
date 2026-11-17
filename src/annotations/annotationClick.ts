import type * as vscode from 'vscode';
import type { CodeAnnotation } from '../api/types';
import { displayedLines, type DocumentLines } from './annotationDecorations';

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
