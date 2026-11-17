import * as vscode from 'vscode';
import type { CodeAnnotation } from '../api/types';

export const TOGGLE_EXPANDED_COMMAND = 'governedWorkflow.annotations.toggleExpanded';
const MARKDOWN_SPECIAL_CHARACTERS = /[\\`*_{}[\]()#+\-.!|<>~]/g;

export interface AnnotationCommandArgs {
  readonly documentUri: string;
  readonly annotationId: number;
}

// The note is untrusted Markdown in its own block; only the details block may run a command, and only the toggle.
export function annotationHoverContents(annotation: CodeAnnotation, documentUri: string, isOpen: boolean): vscode.MarkdownString[] {
  const note = new vscode.MarkdownString(annotation.text);
  const toggle = commandLink(isOpen ? 'Close' : 'Open', TOGGLE_EXPANDED_COMMAND, { documentUri, annotationId: annotation.id });
  const details = new vscode.MarkdownString([metadataLine(annotation), toggle].join('\n\n'));
  details.isTrusted = { enabledCommands: [TOGGLE_EXPANDED_COMMAND] };
  return [note, details];
}

export function commandLink(label: string, command: string, args: AnnotationCommandArgs): string {
  return `[${label}](command:${command}?${encodeURIComponent(JSON.stringify([args]))})`;
}

function metadataLine(annotation: CodeAnnotation): string {
  const edited = annotation.updated_at !== annotation.created_at ? `, edited ${formatTime(annotation.updated_at)}` : '';
  const stale = annotation.stale ? ' — *stale: the annotated lines changed*' : '';
  return `*${escapeMarkdown(annotation.author)}, ${formatTime(annotation.created_at)}${edited}*${stale}`;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return escapeMarkdown(Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString());
}

function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIAL_CHARACTERS, '\\$&');
}
