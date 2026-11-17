import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ApiError } from '../src/api/errors';
import type { CodeAnnotation } from '../src/api/types';
import { annotationsClickedAt } from '../src/annotations/annotationClick';
import {
  ANNOTATION_CONTROLLER_ID,
  AnnotationComment,
  AnnotationThreads,
} from '../src/annotations/annotationThreads';
import {
  AnnotationCommands,
  CANCEL_ANNOTATION_EDIT_COMMAND,
  CLOSE_ANNOTATION_COMMAND,
  DELETE_ANNOTATION_COMMAND,
  EDIT_ANNOTATION_COMMAND,
  SAVE_ANNOTATION_COMMAND,
  type AnnotationCommandDeps,
  type AnnotationLookup,
} from '../src/annotations/annotations';
import { runWithErrorMessage } from '../src/diff/diffView';
import { markdownToPlainPreview } from '../src/annotations/plainPreview';

const WORKSPACE = { projectId: 'proj', branch: 'feature/x' };
const TARGET = { workspace: WORKSPACE, repo: '', filePath: 'src/app.ts', ref: '' };

interface FakeThread {
  uri: vscode.Uri;
  range: vscode.Range | undefined;
  comments: readonly vscode.Comment[];
  canReply: boolean;
  label: string | undefined;
  collapsibleState: number | undefined;
  dispose: ReturnType<typeof vi.fn>;
}

function makeAnnotation(overrides: Partial<CodeAnnotation> = {}): CodeAnnotation {
  return {
    id: 1,
    repo: '',
    file_path: 'src/app.ts',
    line_start: 3,
    line_end: 4,
    text: 'Explains the **retry** loop.',
    author: 'agent',
    stale: false,
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-01T10:00:00',
    ...overrides,
  };
}

function makeDocument(path = '/work/tree/src/app.ts', lineCount = 20) {
  return { uri: vscode.Uri.file(path), lineCount } as unknown as vscode.TextDocument;
}

function makeController() {
  const created: FakeThread[] = [];
  const controller = {
    created,
    dispose: vi.fn(),
    createCommentThread: vi.fn((uri: vscode.Uri, range: vscode.Range, comments: vscode.Comment[]) => {
      const thread: FakeThread = { uri, range, comments, canReply: true, label: undefined, collapsibleState: undefined, dispose: vi.fn() };
      created.push(thread);
      return thread;
    }),
  };
  return controller;
}

function caret(line: number, character: number) {
  const position = new vscode.Position(line, character);
  return { anchor: position, active: position };
}

function bodyOf(thread: FakeThread): string {
  const body = thread.comments[0].body;
  return typeof body === 'string' ? body : body.value;
}

describe('markdownToPlainPreview', () => {
  it.each([
    ['# Heading\nbody', 'Heading body'],
    ['### Closed heading ###', 'Closed heading'],
    ['**bold** and __strong__', 'bold and strong'],
    ['*em* and _em_', 'em and em'],
    ['~~gone~~ kept', 'gone kept'],
    ['call `retry()` here', 'call retry() here'],
    ['```ts\nconst a = 1;\n```', 'const a = 1;'],
    ['see [the docs](https://example.com/x)', 'see the docs'],
    ['![diagram](img.png) below', 'diagram below'],
    ['- one\n* two\n+ three\n1. four\n2) five', 'one two three four five'],
    ['- [x] done task', 'done task'],
    ['> quoted\n> > nested', 'quoted nested'],
    ['a <b>bold</b><br/> tag <!-- hidden -->', 'a bold tag'],
    ['above\n\n---\n\nbelow', 'above below'],
    ['keeps snake_case_name intact', 'keeps snake_case_name intact'],
    ['2 * 3 * 4', '2 * 3 * 4'],
    ['an \\*escaped\\* star and \\# hash', 'an *escaped* star and # hash'],
    ['line one\r\n\r\n   line   two', 'line one line two'],
  ])('markdownToPlainPreview_shouldStripSyntax_for %j', (markdown, plain) => {
    expect(markdownToPlainPreview(markdown)).toBe(plain);
  });

  it('markdownToPlainPreview_shouldTruncateWithAnEllipsis_whenLongerThanTheLimit', () => {
    const preview = markdownToPlainPreview(`**${'word '.repeat(40).trim()}**`, 20);

    expect(preview).toBe('word word word word…');
  });

  it('markdownToPlainPreview_shouldKeepShortText_whenWithinTheLimit', () => {
    expect(markdownToPlainPreview('short', 5)).toBe('short');
  });
});

describe('annotationsClickedAt', () => {
  const lines = { lineCount: 10, lengthOf: (line: number) => (line === 3 ? 12 : 5) };
  const annotations = [makeAnnotation({ id: 1, line_start: 2, line_end: 4 }), makeAnnotation({ id: 2, line_start: 6, line_end: 6 })];

  it('annotationsClickedAt_shouldReturnTheAnnotation_whenEmptyCaretLandsAtTheEndOfItsLastLine', () => {
    expect(annotationsClickedAt(annotations, lines, caret(3, 12)).map((entry) => entry.id)).toEqual([1]);
  });

  it('annotationsClickedAt_shouldIgnoreTheClick_whenCaretIsInsideTheLine', () => {
    expect(annotationsClickedAt(annotations, lines, caret(3, 4))).toEqual([]);
  });

  it('annotationsClickedAt_shouldIgnoreTheClick_whenLineIsNotTheLastAnnotatedLine', () => {
    expect(annotationsClickedAt(annotations, lines, caret(2, 5))).toEqual([]);
  });

  it('annotationsClickedAt_shouldIgnoreTheClick_whenSelectionIsNotEmpty', () => {
    const selection = { anchor: new vscode.Position(3, 0), active: new vscode.Position(3, 12) };

    expect(annotationsClickedAt(annotations, lines, selection)).toEqual([]);
  });

  it('annotationsClickedAt_shouldUseTheClampedLine_whenAnnotationEndsPastTheDocument', () => {
    const clamped = [makeAnnotation({ id: 3, line_start: 9, line_end: 40 })];

    expect(annotationsClickedAt(clamped, lines, caret(9, 5)).map((entry) => entry.id)).toEqual([3]);
  });
});

describe('AnnotationThreads', () => {
  let controller: ReturnType<typeof makeController>;
  let threads: AnnotationThreads;
  const document = makeDocument();
  const ref = { documentUri: document.uri.toString(), annotationId: 1 };

  beforeEach(() => {
    controller = makeController();
    threads = new AnnotationThreads(controller as unknown as vscode.CommentController);
  });

  it('toggle_shouldCreateAnExpandedReadOnlyThread_onlyWhenOpened', () => {
    expect(controller.createCommentThread).not.toHaveBeenCalled();

    threads.toggle(document, [makeAnnotation({ line_start: 3, line_end: 5 })]);

    const [thread] = controller.created;
    expect(thread.range).toEqual(new vscode.Range(2, 0, 4, 0));
    expect(thread.canReply).toBe(false);
    expect(thread.collapsibleState).toBe(vscode.CommentThreadCollapsibleState.Expanded);
    expect(thread.label).toBe('Annotation · agent');
    expect(threads.isOpen(ref)).toBe(true);
  });

  it('toggle_shouldRenderTheNoteAsUntrustedMarkdown_withAuthorAndTime', () => {
    threads.toggle(document, [makeAnnotation()]);

    const comment = controller.created[0].comments[0] as AnnotationComment;
    expect(comment.body).toMatchObject({ value: 'Explains the **retry** loop.', isTrusted: false, supportHtml: false });
    expect(comment.author.name).toBe('agent');
    expect(comment.timestamp).toEqual(new Date('2026-11-01T10:00:00'));
    expect(comment.mode).toBe(vscode.CommentMode.Preview);
  });

  it('toggle_shouldDisposeTheThread_whenOpenedAgain', () => {
    threads.toggle(document, [makeAnnotation()]);

    threads.toggle(document, [makeAnnotation()]);

    expect(controller.created[0].dispose).toHaveBeenCalledOnce();
    expect(threads.isOpen(ref)).toBe(false);
  });

  it('toggle_shouldOpenTheClosedOnes_whenOnlySomeAnnotationsOnTheLineAreOpen', () => {
    threads.toggle(document, [makeAnnotation({ id: 1 })]);

    threads.toggle(document, [makeAnnotation({ id: 1 }), makeAnnotation({ id: 2 })]);

    expect(controller.created).toHaveLength(2);
    expect(controller.created[0].dispose).not.toHaveBeenCalled();
  });

  it('toggle_shouldKeepThreadsApart_whenTheSameAnnotationIsOpenInTwoDocuments', () => {
    const diffSide = makeDocument('/base/src/app.ts');

    threads.toggle(document, [makeAnnotation()]);
    threads.toggle(diffSide, [makeAnnotation()]);

    expect(controller.created.map((thread) => thread.uri.toString())).toEqual([document.uri.toString(), diffSide.uri.toString()]);
  });

  it('closeThread_shouldDisposeTheThread_whenItsCloseActionRuns', () => {
    threads.toggle(document, [makeAnnotation()]);

    threads.closeThread(controller.created[0] as unknown as vscode.CommentThread);

    expect(controller.created[0].dispose).toHaveBeenCalledOnce();
    expect(threads.isOpen(ref)).toBe(false);
  });

  it('sync_shouldMoveAndRefreshTheThread_whenTheAnnotationChanged', () => {
    threads.toggle(document, [makeAnnotation()]);

    threads.sync(document, [makeAnnotation({ line_start: 6, line_end: 7, text: 'refreshed' })]);

    expect(controller.created[0].range).toEqual(new vscode.Range(5, 0, 6, 0));
    expect(bodyOf(controller.created[0])).toBe('refreshed');
  });

  it('sync_shouldCloseTheThread_whenTheAnnotationIsGoneOrAnnotationsAreHidden', () => {
    threads.toggle(document, [makeAnnotation({ id: 1 }), makeAnnotation({ id: 2 })]);

    threads.sync(document, [makeAnnotation({ id: 2 })]);
    threads.sync(document, undefined);

    expect(controller.created.every((thread) => thread.dispose.mock.calls.length === 1)).toBe(true);
  });

  it('sync_shouldKeepTheTypedText_whileTheNoteIsBeingEdited', () => {
    threads.toggle(document, [makeAnnotation()]);
    const comment = controller.created[0].comments[0] as AnnotationComment;
    threads.beginEdit(comment);
    comment.body = new vscode.MarkdownString('typed so far');

    threads.sync(document, [makeAnnotation({ text: 'refreshed' })]);

    expect(comment.mode).toBe(vscode.CommentMode.Editing);
    expect(comment.editedText).toBe('typed so far');
  });

  it('cancelEdit_shouldRestoreTheSavedNoteInPreview', () => {
    threads.toggle(document, [makeAnnotation()]);
    const comment = controller.created[0].comments[0] as AnnotationComment;
    threads.beginEdit(comment);
    comment.body = new vscode.MarkdownString('discarded');

    threads.cancelEdit(comment);

    expect(comment.mode).toBe(vscode.CommentMode.Preview);
    expect(bodyOf(controller.created[0])).toBe('Explains the **retry** loop.');
  });

  it('dispose_shouldDisposeOpenThreadsAndTheController', () => {
    threads.toggle(document, [makeAnnotation()]);

    threads.dispose();

    expect(controller.created[0].dispose).toHaveBeenCalledOnce();
    expect(controller.dispose).toHaveBeenCalledOnce();
  });
});

describe('AnnotationCommands', () => {
  const document = makeDocument();
  let controller: ReturnType<typeof makeController>;
  let threads: AnnotationThreads;
  let lookup: { [K in keyof AnnotationLookup]: ReturnType<typeof vi.fn> };
  let client: { updateAnnotation: ReturnType<typeof vi.fn>; deleteAnnotation: ReturnType<typeof vi.fn> };
  let commands: AnnotationCommands;

  function openComment(annotation = makeAnnotation()): AnnotationComment {
    threads.toggle(document, [annotation]);
    return controller.created.at(-1)!.comments[0] as AnnotationComment;
  }

  beforeEach(() => {
    vi.mocked(vscode.window.showWarningMessage).mockReset();
    vi.mocked(vscode.window.showErrorMessage).mockReset();
    controller = makeController();
    threads = new AnnotationThreads(controller as unknown as vscode.CommentController);
    lookup = {
      targetOf: vi.fn(),
      annotationsAt: vi.fn(),
      locate: vi.fn(() => ({ document, target: TARGET, annotation: makeAnnotation() })),
      refresh: vi.fn(async () => undefined),
    };
    client = { updateAnnotation: vi.fn(), deleteAnnotation: vi.fn(async () => undefined) };
    const deps = { client, settings: {} } as unknown as AnnotationCommandDeps;
    commands = new AnnotationCommands(lookup as unknown as AnnotationLookup, threads, deps);
  });

  it('edit_shouldSwitchTheCommentToNativeEditMode', () => {
    const comment = openComment();

    commands.edit(comment);

    expect(comment.mode).toBe(vscode.CommentMode.Editing);
  });

  it('saveEdit_shouldPatchTheTextAndShowTheSavedNote_whenTextChanged', async () => {
    const comment = openComment();
    commands.edit(comment);
    comment.body = new vscode.MarkdownString('  New *text*  ');
    client.updateAnnotation.mockResolvedValue(makeAnnotation({ text: 'New *text*', updated_at: '2026-11-02T10:00:00' }));

    await commands.saveEdit(comment);

    expect(client.updateAnnotation).toHaveBeenCalledWith(WORKSPACE, 1, { text: 'New *text*' });
    expect(comment.mode).toBe(vscode.CommentMode.Preview);
    expect(comment.label).toBe('Edited');
    expect(bodyOf(controller.created[0])).toBe('New *text*');
    expect(lookup.refresh).toHaveBeenCalledWith(TARGET);
  });

  it('saveEdit_shouldLeaveEditMode_withoutARequest_whenTextIsUnchanged', async () => {
    const comment = openComment();
    commands.edit(comment);

    await commands.saveEdit(comment);

    expect(client.updateAnnotation).not.toHaveBeenCalled();
    expect(comment.mode).toBe(vscode.CommentMode.Preview);
  });

  it('saveEdit_shouldWarnAndStayInEditMode_whenTextIsBlank', async () => {
    const comment = openComment();
    commands.edit(comment);
    comment.body = '   ';

    await commands.saveEdit(comment);

    expect(client.updateAnnotation).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('The annotation text is required.');
    expect(comment.mode).toBe(vscode.CommentMode.Editing);
  });

  it('saveEdit_shouldKeepTheTypedTextAndReport_whenTheServerRejectsIt', async () => {
    const comment = openComment();
    commands.edit(comment);
    comment.body = new vscode.MarkdownString('retry me');
    client.updateAnnotation.mockRejectedValue(new ApiError(500, 'server_error', 'boom'));

    await runWithErrorMessage(() => commands.saveEdit(comment));

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('boom');
    expect(comment.mode).toBe(vscode.CommentMode.Editing);
    expect(comment.editedText).toBe('retry me');
  });

  it('delete_shouldDeleteAndCloseTheThread_whenConfirmed', async () => {
    const comment = openComment();
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Delete' as never);

    await commands.delete(comment);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'Delete this annotation?',
      { modal: true, detail: 'Explains the retry loop.' },
      'Delete',
    );
    expect(client.deleteAnnotation).toHaveBeenCalledWith(WORKSPACE, 1);
    expect(controller.created[0].dispose).toHaveBeenCalledOnce();
    expect(lookup.refresh).toHaveBeenCalledWith(TARGET);
  });

  it('delete_shouldKeepTheAnnotation_whenNotConfirmed', async () => {
    const comment = openComment();
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined as never);

    await commands.delete(comment);

    expect(client.deleteAnnotation).not.toHaveBeenCalled();
    expect(controller.created[0].dispose).not.toHaveBeenCalled();
  });

  it('toggleOpen_shouldOpenThenClose_whenCalledTwiceWithTheSameAnnotation', () => {
    const args = { documentUri: document.uri.toString(), annotationId: 1 };

    commands.toggleOpen(args);
    commands.toggleOpen(args);

    expect(controller.created).toHaveLength(1);
    expect(controller.created[0].dispose).toHaveBeenCalledOnce();
  });

  it('toggleOpen_shouldWarn_whenTheAnnotationIsNoLongerShown', () => {
    lookup.locate.mockReturnValue(undefined);

    commands.toggleOpen({ documentUri: document.uri.toString(), annotationId: 9 });

    expect(controller.createCommentThread).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledOnce();
  });
});

describe('annotation comment menus', () => {
  const menus = JSON.parse(readFileSync('package.json', 'utf8')).contributes.menus as Record<string, { command: string; when: string }[]>;

  it.each([
    ['comments/comment/title', EDIT_ANNOTATION_COMMAND],
    ['comments/comment/title', DELETE_ANNOTATION_COMMAND],
    ['comments/comment/context', SAVE_ANNOTATION_COMMAND],
    ['comments/comment/context', CANCEL_ANNOTATION_EDIT_COMMAND],
    ['comments/commentThread/title', CLOSE_ANNOTATION_COMMAND],
  ])('%s_shouldOffer %s_onlyOnAnnotationThreads', (menu, command) => {
    const entry = menus[menu].find((candidate) => candidate.command === command);

    expect(entry?.when).toBe(`commentController == ${ANNOTATION_CONTROLLER_ID}`);
  });
});
