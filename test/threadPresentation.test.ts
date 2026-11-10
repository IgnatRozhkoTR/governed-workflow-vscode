import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { toEditorRange, toLineSpan } from '../src/comments/threadPresentation';
import { Range } from './vscodeStub';

function range(startLine: number, startCharacter: number, endLine: number, endCharacter: number): vscode.Range {
  return new Range(startLine, startCharacter, endLine, endCharacter) as unknown as vscode.Range;
}

// Shapes as VS Code's CommentController.onEditorMouseUp builds them (0-based here):
// gutter click = empty range on the clicked line, gutter drag = start of first line to end of last line,
// keyboard "Add Comment on Current Selection" and a click inside a selection = the editor selection.
describe('toLineSpan', () => {
  it('toLineSpan_shouldKeepSingleLine_whenGutterClickGivesEmptyRange', () => {
    expect(toLineSpan(range(4, 0, 4, 0), 10)).toEqual({ start: 5, end: 5 });
  });

  it('toLineSpan_shouldKeepSingleLine_whenGutterClickIsOnEmptyLine', () => {
    expect(toLineSpan(range(4, 0, 4, 0), 0)).toEqual({ start: 5, end: 5 });
  });

  it('toLineSpan_shouldKeepLastLine_whenGutterDragEndsAtEndOfLine', () => {
    expect(toLineSpan(range(4, 0, 6, 12), 12)).toEqual({ start: 5, end: 7 });
  });

  it('toLineSpan_shouldKeepLastLine_whenGutterDragEndsOnEmptyLine', () => {
    expect(toLineSpan(range(4, 0, 7, 0), 0)).toEqual({ start: 5, end: 8 });
  });

  it('toLineSpan_shouldExcludeNextLine_whenSelectionEndsAtColumnZeroOfNonEmptyLine', () => {
    expect(toLineSpan(range(4, 0, 7, 0), 8)).toEqual({ start: 5, end: 7 });
  });

  it('toLineSpan_shouldKeepLastLine_whenSelectionEndsInsideIt', () => {
    expect(toLineSpan(range(4, 3, 6, 5), 12)).toEqual({ start: 5, end: 7 });
  });
});

describe('toEditorRange', () => {
  it('toEditorRange_shouldConvertOneBasedSpanToZeroBasedLines', () => {
    expect(toEditorRange({ start: 5, end: 7 })).toMatchObject({ start: { line: 4 }, end: { line: 6 } });
  });
});
