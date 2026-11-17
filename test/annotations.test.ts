import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ApiError } from '../src/api/errors';
import type { CodeAnnotation } from '../src/api/types';
import { buildDecorations, inlineLabel } from '../src/annotations/annotationDecorations';
import { AnnotationStore } from '../src/annotations/annotationStore';
import { annotationTargetOf, targetKey, type AnnotationTarget } from '../src/annotations/annotationTarget';
import { selectedLines } from '../src/annotations/annotations';
import { lineEditsOf, shiftSpans } from '../src/annotations/lineShift';
import { MAX_PREVIEW_LENGTH } from '../src/annotations/plainPreview';
import { WorkspaceLocator } from '../src/fs/workspaceLocator';
import { baseFileUriParts, remoteFileUriParts } from '../src/fs/uris';
import { makeState } from './support/fixtures';

const WORKSPACE = { projectId: 'proj', branch: 'feature/x' };
const WORKING_DIR = '/work/tree';
const DOCUMENT_URI = 'file:///work/tree/src/app.ts';

function makeAnnotation(overrides: Partial<CodeAnnotation> = {}): CodeAnnotation {
  return {
    id: 1,
    repo: '',
    file_path: 'src/app.ts',
    line_start: 3,
    line_end: 4,
    text: 'Explains the retry loop.',
    author: 'agent',
    stale: false,
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-01T10:00:00',
    ...overrides,
  };
}

function snapshotOf(projectType: 'single' | 'multi' = 'single') {
  return { workspace: WORKSPACE, state: makeState({ working_dir: WORKING_DIR, project_type: projectType }) };
}

function targetFor(uri: vscode.Uri, isModifiedSide = false, projectType: 'single' | 'multi' = 'single') {
  return annotationTargetOf(uri, snapshotOf(projectType), new WorkspaceLocator(), () => isModifiedSide);
}

function baseUri(relPath: string, ref: string, repo?: string, workspace = WORKSPACE): vscode.Uri {
  return vscode.Uri.from(baseFileUriParts({ workspace, relPath, baseRef: ref, repo }));
}

function change(startLine: number, startCharacter: number, endLine: number, endCharacter: number, text: string) {
  return { range: new vscode.Range(startLine, startCharacter, endLine, endCharacter), text };
}

function documentLines(lineCount: number, lineLength = 10) {
  return { lineCount, lengthOf: () => lineLength };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const TARGET: AnnotationTarget = { workspace: WORKSPACE, repo: '', filePath: 'src/app.ts', ref: '' };

describe('annotationTargetOf', () => {
  it('annotationTargetOf_shouldAddressTheWorkingTreeOfThePrimaryRepo_whenLocalFileOfSingleRepoWorkspace', () => {
    expect(targetFor(vscode.Uri.file(`${WORKING_DIR}/src/app.ts`))).toEqual({ workspace: WORKSPACE, repo: '', filePath: 'src/app.ts', ref: '' });
  });

  it('annotationTargetOf_shouldSplitOffTheRepoDirectory_whenMultiRepoWorkspace', () => {
    const target = targetFor(vscode.Uri.file(`${WORKING_DIR}/api/src/app.ts`), false, 'multi');

    expect(target).toMatchObject({ repo: 'api', filePath: 'src/app.ts', ref: '' });
  });

  it('annotationTargetOf_shouldReturnUndefined_whenMultiRepoFileLivesAtTheWorkingDirRoot', () => {
    expect(targetFor(vscode.Uri.file(`${WORKING_DIR}/README.md`), false, 'multi')).toBeUndefined();
  });

  it('annotationTargetOf_shouldReturnUndefined_whenFileIsOutsideTheWorktree', () => {
    expect(targetFor(vscode.Uri.file('/elsewhere/src/app.ts'))).toBeUndefined();
  });

  it('annotationTargetOf_shouldAddressTheWorkingTree_whenRemoteFileOfTheActiveWorkspace', () => {
    const uri = vscode.Uri.from(remoteFileUriParts({ workspace: WORKSPACE, relPath: 'src/app.ts' }));

    expect(targetFor(uri)).toMatchObject({ repo: '', filePath: 'src/app.ts', ref: '' });
  });

  it('annotationTargetOf_shouldReturnUndefined_whenRemoteFileOfAnotherProject', () => {
    const uri = vscode.Uri.from(remoteFileUriParts({ workspace: { ...WORKSPACE, projectId: 'other' }, relPath: 'src/app.ts' }));

    expect(targetFor(uri)).toBeUndefined();
  });

  it('annotationTargetOf_shouldPassTheRefAndRepo_whenBaseDocumentIsTheModifiedSideOfACommitDiff', () => {
    expect(targetFor(baseUri('src/app.ts', 'abc123', 'api'), true)).toEqual({ workspace: WORKSPACE, repo: 'api', filePath: 'src/app.ts', ref: 'abc123' });
  });

  it('annotationTargetOf_shouldNormaliseTheRootRepoAlias_whenBaseDocumentNamesRepoDot', () => {
    expect(targetFor(baseUri('src/app.ts', 'abc123', '.'), true)).toMatchObject({ repo: '' });
  });

  it('annotationTargetOf_shouldReturnUndefined_whenBaseDocumentIsTheOriginalSide', () => {
    expect(targetFor(baseUri('src/app.ts', 'main'), false)).toBeUndefined();
  });

  it('annotationTargetOf_shouldReturnUndefined_whenBaseDocumentBelongsToAnotherBranch', () => {
    expect(targetFor(baseUri('src/app.ts', 'abc123', undefined, { ...WORKSPACE, branch: 'other' }), true)).toBeUndefined();
  });

  it('annotationTargetOf_shouldReturnUndefined_whenSchemeIsNotAWorkspaceFile', () => {
    expect(targetFor(vscode.Uri.from({ scheme: 'git', path: `${WORKING_DIR}/src/app.ts` }))).toBeUndefined();
  });

  it('targetKey_shouldDiffer_whenOnlyTheRefDiffers', () => {
    expect(targetKey(TARGET)).not.toBe(targetKey({ ...TARGET, ref: 'abc123' }));
  });
});

describe('inlineLabel', () => {
  it('inlineLabel_shouldTruncateWithAnEllipsis_whenTextIsLongerThanTheLimit', () => {
    const label = inlineLabel(makeAnnotation({ text: 'x'.repeat(200) }));

    expect(label.endsWith('…')).toBe(true);
    expect(label.replace(/^✎ /, '')).toHaveLength(MAX_PREVIEW_LENGTH);
  });

  it('inlineLabel_shouldShowPlainText_whenNoteIsMarkdown', () => {
    expect(inlineLabel(makeAnnotation({ text: '## Retry\n\nUses **exponential** `backoff`.' }))).toBe('✎ Retry Uses exponential backoff.');
  });

  it('inlineLabel_shouldAppendStaleMarker_whenAnchorWasLost', () => {
    expect(inlineLabel(makeAnnotation({ text: 'note', stale: true }))).toBe('✎ note (stale)');
  });
});

describe('buildDecorations', () => {
  it('buildDecorations_shouldPlaceTextAtEndOfLastLine_andMarkEveryAnnotatedLine', () => {
    const decorations = buildDecorations([makeAnnotation({ line_start: 3, line_end: 5 })], documentLines(10, 7));

    expect(decorations.inline).toHaveLength(1);
    expect(decorations.inline[0].range).toEqual(new vscode.Range(4, 7, 4, 7));
    expect(decorations.markers).toEqual([new vscode.Range(2, 0, 4, 0)]);
    expect(decorations.staleInline).toEqual([]);
  });

  it('buildDecorations_shouldUseTheStaleDecorations_whenAnnotationIsStale', () => {
    const decorations = buildDecorations([makeAnnotation({ stale: true })], documentLines(10));

    expect(decorations.inline).toEqual([]);
    expect(decorations.staleInline).toHaveLength(1);
    expect(decorations.staleMarkers).toHaveLength(1);
  });

  it('buildDecorations_shouldClampToTheLastLine_whenAnnotationIsPastTheEndOfTheDocument', () => {
    const decorations = buildDecorations([makeAnnotation({ line_start: 8, line_end: 12 })], documentLines(5));

    expect(decorations.markers).toEqual([new vscode.Range(4, 0, 4, 0)]);
  });

  it('buildDecorations_shouldRenderThePlainPreview_asTheInlineText', () => {
    const decorations = buildDecorations([makeAnnotation({ text: 'See [the docs](https://example.com).' })], documentLines(10));

    expect(decorations.inline[0].renderOptions?.after?.contentText).toBe('✎ See the docs.');
  });

  it('buildDecorations_shouldSkipEverything_whenDocumentIsEmpty', () => {
    const decorations = buildDecorations([makeAnnotation()], documentLines(0));

    expect([...decorations.inline, ...decorations.markers]).toEqual([]);
  });
});

describe('dirty document line shifting', () => {
  const span = { line_start: 5, line_end: 7 };

  it('shiftSpans_shouldMoveTheAnnotationDown_whenLinesAreInsertedAboveIt', () => {
    expect(shiftSpans([span], lineEditsOf([change(1, 0, 1, 0, 'a\nb\n')]))).toEqual([{ line_start: 7, line_end: 9 }]);
  });

  it('shiftSpans_shouldMoveTheAnnotationUp_whenLinesAboveAreDeleted', () => {
    expect(shiftSpans([span], lineEditsOf([change(0, 0, 2, 0, '')]))).toEqual([{ line_start: 3, line_end: 5 }]);
  });

  it('shiftSpans_shouldMoveTheAnnotation_whenEnterIsTypedAtColumnZeroOfItsFirstLine', () => {
    expect(shiftSpans([span], lineEditsOf([change(4, 0, 4, 0, '\n')]))).toEqual([{ line_start: 6, line_end: 8 }]);
  });

  it('shiftSpans_shouldGrowTheAnnotation_whenALineIsInsertedInsideIt', () => {
    expect(shiftSpans([span], lineEditsOf([change(5, 3, 5, 3, '\n')]))).toEqual([{ line_start: 5, line_end: 8 }]);
  });

  it('shiftSpans_shouldKeepTheAnnotation_whenEditIsBelowIt', () => {
    expect(shiftSpans([span], lineEditsOf([change(9, 0, 12, 0, '')]))).toEqual([span]);
  });

  it('shiftSpans_shouldKeepTheAnnotation_whenEditChangesNoLineCount', () => {
    expect(shiftSpans([span], lineEditsOf([change(1, 0, 1, 4, 'abcd')]))).toEqual([span]);
  });

  it('shiftSpans_shouldTrimTheStart_whenDeletionCoversItsFirstLines', () => {
    expect(shiftSpans([span], lineEditsOf([change(2, 0, 5, 0, '')]))).toEqual([{ line_start: 3, line_end: 4 }]);
  });

  it('shiftSpans_shouldApplyEveryChangeAgainstTheOriginalLines_whenOneEventHasSeveralChanges', () => {
    const edits = lineEditsOf([change(0, 0, 0, 0, 'x\n'), change(8, 0, 8, 0, 'y\n')]);

    expect(shiftSpans([span], edits)).toEqual([{ line_start: 6, line_end: 8 }]);
  });

  it('shiftSpans_shouldKeepTheOtherFields_whenAnnotationShifts', () => {
    const [shifted] = shiftSpans([makeAnnotation({ line_start: 5, line_end: 5 })], lineEditsOf([change(0, 0, 0, 0, '\n')]));

    expect(shifted).toMatchObject({ id: 1, text: 'Explains the retry loop.', line_start: 6, line_end: 6 });
  });
});

describe('AnnotationStore', () => {
  it('request_shouldSendOneRequestAndOneFollowUp_whenAskedRepeatedlyWhileInFlight', async () => {
    const first = deferred<CodeAnnotation[]>();
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce([makeAnnotation({ id: 2 })]);
    const store = new AnnotationStore(fetcher, vi.fn());

    const done = store.request(TARGET);
    void store.request(TARGET);
    void store.request(TARGET);
    first.resolve([makeAnnotation()]);
    await done;

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(store.get(targetKey(TARGET))?.map((entry) => entry.id)).toEqual([2]);
  });

  it('request_shouldFetchEachFileSeparately_whenTargetsDiffer', async () => {
    const fetcher = vi.fn().mockResolvedValue([]);
    const store = new AnnotationStore(fetcher, vi.fn());

    await Promise.all([store.request(TARGET), store.request({ ...TARGET, ref: 'abc123' })]);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('request_shouldReplayEditsMadeWhileInFlight_whenResultArrives', async () => {
    const response = deferred<CodeAnnotation[]>();
    const store = new AnnotationStore(vi.fn().mockReturnValue(response.promise), vi.fn());

    const done = store.request(TARGET);
    store.applyEdits(targetKey(TARGET), lineEditsOf([change(0, 0, 0, 0, '\n\n')]));
    response.resolve([makeAnnotation({ line_start: 3, line_end: 4 })]);
    await done;

    expect(store.get(targetKey(TARGET))?.[0]).toMatchObject({ line_start: 5, line_end: 6 });
  });

  it('applyEdits_shouldShiftCachedAnnotationsAndNotify_whenFileIsCached', async () => {
    const store = new AnnotationStore(vi.fn().mockResolvedValue([makeAnnotation()]), vi.fn());
    await store.request(TARGET);
    const listener = vi.fn();
    store.onDidChange(listener);

    store.applyEdits(targetKey(TARGET), lineEditsOf([change(0, 0, 0, 0, '\n')]));

    expect(store.get(targetKey(TARGET))?.[0]).toMatchObject({ line_start: 4, line_end: 5 });
    expect(listener).toHaveBeenCalledWith(targetKey(TARGET));
  });

  it('clear_shouldDiscardTheInFlightResult_whenWorkspaceChanges', async () => {
    const response = deferred<CodeAnnotation[]>();
    const store = new AnnotationStore(vi.fn().mockReturnValue(response.promise), vi.fn());

    const done = store.request(TARGET);
    store.clear();
    response.resolve([makeAnnotation()]);
    await done;

    expect(store.has(targetKey(TARGET))).toBe(false);
  });

  it('request_shouldCacheNoAnnotationsAndReport_whenServerCannotFindTheFile', async () => {
    const reportError = vi.fn();
    const store = new AnnotationStore(vi.fn().mockRejectedValue(new ApiError(404, 'file_not_found', 'missing')), reportError);

    await store.request(TARGET);

    expect(store.get(targetKey(TARGET))).toEqual([]);
    expect(reportError).toHaveBeenCalledOnce();
  });

  it('request_shouldKeepTheShownAnnotations_whenServerFails', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce([makeAnnotation()]).mockRejectedValueOnce(new ApiError(0, 'network_error', 'offline'));
    const store = new AnnotationStore(fetcher, vi.fn());

    await store.request(TARGET);
    await store.request(TARGET);

    expect(store.get(targetKey(TARGET))).toHaveLength(1);
  });
});

describe('selectedLines', () => {
  it('selectedLines_shouldExcludeTheLastLine_whenSelectionEndsAtItsColumnZero', () => {
    expect(selectedLines(new vscode.Range(2, 0, 5, 0))).toEqual({ lineStart: 3, lineEnd: 5 });
  });

  it('selectedLines_shouldUseTheCursorLine_whenSelectionIsEmpty', () => {
    expect(selectedLines(new vscode.Range(4, 3, 4, 3))).toEqual({ lineStart: 5, lineEnd: 5 });
  });
});
