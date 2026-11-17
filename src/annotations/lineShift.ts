import type * as vscode from 'vscode';

const LINE_BREAK = /\r\n|\r|\n/g;

// One replaced range of a document edit, in 0-based lines of the document before the edit.
export interface LineEdit {
  readonly startLine: number;
  readonly endLine: number;
  readonly endCharacter: number;
  readonly insertedLineBreaks: number;
}

export interface LineSpan {
  readonly line_start: number;
  readonly line_end: number;
}

type ContentChange = Pick<vscode.TextDocumentContentChangeEvent, 'range' | 'text'>;

// The changes of one edit event all address the document before it, so applying them bottom-up keeps
// every later change's line numbers valid.
export function lineEditsOf(changes: readonly ContentChange[]): LineEdit[] {
  return changes
    .map((change) => ({
      startLine: change.range.start.line,
      endLine: change.range.end.line,
      endCharacter: change.range.end.character,
      insertedLineBreaks: change.text.match(LINE_BREAK)?.length ?? 0,
    }))
    .sort((first, second) => second.startLine - first.startLine);
}

export function shiftSpans<T extends LineSpan>(spans: readonly T[], edits: readonly LineEdit[]): T[] {
  return spans.map((span) => edits.reduce(shiftSpan, span));
}

function shiftSpan<T extends LineSpan>(span: T, edit: LineEdit): T {
  const start = span.line_start - 1;
  const end = span.line_end - 1;
  const delta = edit.insertedLineBreaks - (edit.endLine - edit.startLine);
  if (delta === 0 || edit.startLine > end) {
    return span;
  }
  if (endsBeforeLine(edit, start)) {
    return { ...span, line_start: span.line_start + delta, line_end: span.line_end + delta };
  }
  const shiftedStart = edit.startLine < start ? Math.max(edit.startLine, start + delta) : start;
  const shiftedEnd = Math.max(shiftedStart, end + delta);
  return { ...span, line_start: shiftedStart + 1, line_end: shiftedEnd + 1 };
}

// An edit ending at column 0 of the first annotated line (Enter typed there, or a line joined into the
// previous one) moves the annotated text without touching it.
function endsBeforeLine(edit: LineEdit, line: number): boolean {
  return edit.endLine < line || (edit.endLine === line && edit.endCharacter === 0);
}
