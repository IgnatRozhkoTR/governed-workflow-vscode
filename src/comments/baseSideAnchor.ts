import * as vscode from 'vscode';
import type { WorkspaceSnapshot } from '../diff/diffView';
import { baseFileUriParts } from '../fs/uris';
import { splitRepoPath, type RepoPath } from '../shared/paths';
import { hashLines, placeLines, type CodeThread } from './commentMapping';

const FILE_NOT_FOUND_CODE = 'FileNotFound';
const MULTI_REPO_PROJECT = 'multi';
const LINE_BREAK = /\r\n|\r|\n/;

export type FilePresence = 'present' | 'missing' | 'unknown';

export function documentLineHashes(document: Pick<vscode.TextDocument, 'getText'>): string[] {
  return hashLines(document.getText().split(LINE_BREAK));
}

// The server stores no diff side on a line comment. A comment made on an old-side line is recognised
// by its line hash: the base document has it at the stored line while the working tree has no matching
// line anywhere the working-side relocation would look, so it cannot be a shifted new-side line.
export function isAnchoredAt(code: CodeThread, documentHashes: readonly string[]): boolean {
  const { lines, root } = code;
  return lines !== undefined && root.line_hash !== null && documentHashes[lines.start - 1] === root.line_hash;
}

export async function isAnchoredInWorkingTree(uri: vscode.Uri, code: CodeThread): Promise<boolean> {
  const { lines } = code;
  if (lines === undefined) {
    return false;
  }
  const presence = await filePresence(uri);
  if (presence !== 'present') {
    return presence === 'unknown';
  }
  const document = await vscode.workspace.openTextDocument(uri);
  return !placeLines(lines, code.root.line_hash, documentLineHashes(document)).isOutdated;
}

// A file deleted on the branch only exists at the branch base, so its threads live on the base document.
export function branchBaseUri(snapshot: WorkspaceSnapshot, filePath: string): vscode.Uri | undefined {
  const baseRef = snapshot.state.source_branch;
  if (!baseRef) {
    return undefined;
  }
  const location: RepoPath = snapshot.state.project_type === MULTI_REPO_PROJECT ? splitRepoPath(filePath) : { relPath: filePath };
  return vscode.Uri.from(baseFileUriParts({ workspace: snapshot.workspace, relPath: location.relPath, baseRef, repo: location.repo }));
}

// Any failure other than "not found" (offline server, no permission) says nothing about the file,
// so callers keep threads where they are and may ask again later.
export async function filePresence(uri: vscode.Uri): Promise<FilePresence> {
  try {
    await vscode.workspace.fs.stat(uri);
    return 'present';
  } catch (error) {
    return isFileNotFound(error) ? 'missing' : 'unknown';
  }
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === FILE_NOT_FOUND_CODE;
}
