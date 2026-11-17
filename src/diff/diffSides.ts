import type * as vscode from 'vscode';

const MAX_REMEMBERED_SIDES = 1000;

// A gw-base document is the original side of every diff this extension opens except commit diffs, whose
// modified side is the commit's content. Open All Changes has no tab input in the stable API to tell the
// sides apart, so the modified sides are recorded when the diff is built.
const modifiedBaseSides = new Set<string>();

export function rememberModifiedSide(uri: vscode.Uri): void {
  const key = uri.toString();
  modifiedBaseSides.delete(key);
  modifiedBaseSides.add(key);
  if (modifiedBaseSides.size > MAX_REMEMBERED_SIDES) {
    const oldest = modifiedBaseSides.values().next().value;
    if (oldest !== undefined) {
      modifiedBaseSides.delete(oldest);
    }
  }
}

export function isModifiedSide(uri: vscode.Uri): boolean {
  return modifiedBaseSides.has(uri.toString());
}
