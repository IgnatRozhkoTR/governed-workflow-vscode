import * as vscode from 'vscode';
import type { CodeAnnotation } from '../api/types';
import { markdownToPlainPreview } from './plainPreview';

const INLINE_GLYPH = '✎';
const STALE_SUFFIX = ' (stale)';
const ANNOTATION_COLOR = 'editorCodeLens.foreground';
const STALE_ANNOTATION_COLOR = 'disabledForeground';
const INLINE_MARGIN = '0 0 0 2em';
const MARKER_BORDER_WIDTH = '0 0 0 2px';

export interface DocumentLines {
  readonly lineCount: number;
  lengthOf(line: number): number;
}

export interface LineRange {
  readonly start: number;
  readonly end: number;
}

export interface AnnotationDecorations {
  readonly inline: vscode.DecorationOptions[];
  readonly staleInline: vscode.DecorationOptions[];
  readonly markers: vscode.Range[];
  readonly staleMarkers: vscode.Range[];
}

export function inlineLabel(annotation: Pick<CodeAnnotation, 'text' | 'stale'>): string {
  return `${INLINE_GLYPH} ${markdownToPlainPreview(annotation.text)}${annotation.stale ? STALE_SUFFIX : ''}`;
}

// Lines the server reports past the end of the shown document (a stale anchor, an unsaved deletion) are clamped.
export function displayedLines(annotation: Pick<CodeAnnotation, 'line_start' | 'line_end'>, lineCount: number): LineRange | undefined {
  if (lineCount === 0) {
    return undefined;
  }
  const lastLine = lineCount - 1;
  const start = Math.min(Math.max(annotation.line_start - 1, 0), lastLine);
  const end = Math.min(Math.max(annotation.line_end - 1, start), lastLine);
  return { start, end };
}

export function buildDecorations(annotations: readonly CodeAnnotation[], document: DocumentLines): AnnotationDecorations {
  const decorations: AnnotationDecorations = { inline: [], staleInline: [], markers: [], staleMarkers: [] };
  for (const annotation of annotations) {
    const lines = displayedLines(annotation, document.lineCount);
    if (lines === undefined) {
      continue;
    }
    const endOfLine = document.lengthOf(lines.end);
    const inline: vscode.DecorationOptions = {
      range: new vscode.Range(lines.end, endOfLine, lines.end, endOfLine),
      renderOptions: { after: { contentText: inlineLabel(annotation) } },
    };
    const marker = new vscode.Range(lines.start, 0, lines.end, 0);
    (annotation.stale ? decorations.staleInline : decorations.inline).push(inline);
    (annotation.stale ? decorations.staleMarkers : decorations.markers).push(marker);
  }
  return decorations;
}

export class AnnotationDecorationTypes implements vscode.Disposable {
  private readonly inline = inlineType(ANNOTATION_COLOR);
  private readonly staleInline = inlineType(STALE_ANNOTATION_COLOR);
  private readonly marker = markerType(ANNOTATION_COLOR, 'solid');
  private readonly staleMarker = markerType(STALE_ANNOTATION_COLOR, 'dashed');

  apply(editor: vscode.TextEditor, decorations: AnnotationDecorations): void {
    editor.setDecorations(this.inline, decorations.inline);
    editor.setDecorations(this.staleInline, decorations.staleInline);
    editor.setDecorations(this.marker, decorations.markers);
    editor.setDecorations(this.staleMarker, decorations.staleMarkers);
  }

  clear(editor: vscode.TextEditor): void {
    this.apply(editor, { inline: [], staleInline: [], markers: [], staleMarkers: [] });
  }

  dispose(): void {
    [this.inline, this.staleInline, this.marker, this.staleMarker].forEach((type) => type.dispose());
  }
}

function inlineType(color: string): vscode.TextEditorDecorationType {
  return vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor(color), fontStyle: 'italic', margin: INLINE_MARGIN },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
}

function markerType(color: string, borderStyle: string): vscode.TextEditorDecorationType {
  return vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderWidth: MARKER_BORDER_WIDTH,
    borderStyle,
    borderColor: new vscode.ThemeColor(color),
    overviewRulerColor: new vscode.ThemeColor(color),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });
}

export function linesOf(document: Pick<vscode.TextDocument, 'lineCount' | 'lineAt'>): DocumentLines {
  return { lineCount: document.lineCount, lengthOf: (line) => document.lineAt(line).text.length };
}
