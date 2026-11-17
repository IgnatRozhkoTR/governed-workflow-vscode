import * as vscode from 'vscode';
import type { CodeAnnotation } from '../api/types';

export const TOGGLE_EXPANDED_COMMAND = 'governedWorkflow.annotations.toggleExpanded';
export const EDIT_ANNOTATION_COMMAND = 'governedWorkflow.annotations.edit';
export const DELETE_ANNOTATION_COMMAND = 'governedWorkflow.annotations.delete';
const HOVER_COMMANDS = [TOGGLE_EXPANDED_COMMAND, EDIT_ANNOTATION_COMMAND, DELETE_ANNOTATION_COMMAND];
const MARKDOWN_SPECIAL_CHARACTERS = /[\\`*_{}[\]()#+\-.!|<>~]/g;
const ACTION_SEPARATOR = ' · ';

export interface AnnotationCommandArgs {
  readonly documentUri: string;
  readonly annotationId: number;
}

// The note is untrusted Markdown in its own block; only the action block may run commands, and only these.
export function annotationHoverContents(annotation: CodeAnnotation, documentUri: string, isExpanded: boolean): vscode.MarkdownString[] {
  const note = new vscode.MarkdownString(annotation.text);
  const details = new vscode.MarkdownString([metadataLine(annotation), actionLine(annotation.id, documentUri, isExpanded)].join('\n\n'));
  details.isTrusted = { enabledCommands: HOVER_COMMANDS };
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

function actionLine(annotationId: number, documentUri: string, isExpanded: boolean): string {
  const args = { documentUri, annotationId };
  return [
    commandLink(isExpanded ? 'Collapse inline' : 'Expand inline', TOGGLE_EXPANDED_COMMAND, args),
    commandLink('Edit', EDIT_ANNOTATION_COMMAND, args),
    commandLink('Delete', DELETE_ANNOTATION_COMMAND, args),
  ].join(ACTION_SEPARATOR);
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return escapeMarkdown(Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString());
}

function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIAL_CHARACTERS, '\\$&');
}
