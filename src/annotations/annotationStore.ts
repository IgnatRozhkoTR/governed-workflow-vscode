import * as vscode from 'vscode';
import { ApiError } from '../api/errors';
import type { CodeAnnotation } from '../api/types';
import { targetKey, type AnnotationTarget } from './annotationTarget';
import { shiftSpans, type LineEdit } from './lineShift';

export type AnnotationFetcher = (target: AnnotationTarget) => Promise<CodeAnnotation[]>;
export type AnnotationErrorReporter = (target: AnnotationTarget, error: ApiError) => void;

interface FileFetch {
  readonly generation: number;
  done: Promise<void>;
  isFollowUpRequested: boolean;
  editsSinceRequest: LineEdit[];
}

// Annotations per file and ref. At most one request per file is in flight: a refresh asked for meanwhile
// runs once after it, and edits made to the document while it runs are replayed onto its result.
export class AnnotationStore implements vscode.Disposable {
  private readonly entries = new Map<string, readonly CodeAnnotation[]>();
  private readonly inFlight = new Map<string, FileFetch>();
  private readonly changeEmitter = new vscode.EventEmitter<string>();
  private generation = 0;

  readonly onDidChange: vscode.Event<string> = this.changeEmitter.event;

  constructor(
    private readonly fetchAnnotations: AnnotationFetcher,
    private readonly reportError: AnnotationErrorReporter,
  ) {}

  get(key: string): readonly CodeAnnotation[] | undefined {
    return this.entries.get(key);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  request(target: AnnotationTarget): Promise<void> {
    const key = targetKey(target);
    const running = this.inFlight.get(key);
    if (running !== undefined) {
      running.isFollowUpRequested = true;
      return running.done;
    }
    const fetch: FileFetch = { generation: this.generation, done: Promise.resolve(), isFollowUpRequested: false, editsSinceRequest: [] };
    this.inFlight.set(key, fetch);
    fetch.done = this.runFetchCycle(key, target, fetch);
    return fetch.done;
  }

  applyEdits(key: string, edits: readonly LineEdit[]): void {
    const running = this.inFlight.get(key);
    running?.editsSinceRequest.push(...edits);
    const annotations = this.entries.get(key);
    if (annotations !== undefined && annotations.length > 0 && edits.length > 0) {
      this.entries.set(key, shiftSpans(annotations, edits));
      this.changeEmitter.fire(key);
    }
  }

  forget(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.generation++;
    this.inFlight.clear();
    this.entries.clear();
  }

  dispose(): void {
    this.clear();
    this.changeEmitter.dispose();
  }

  private async runFetchCycle(key: string, target: AnnotationTarget, fetch: FileFetch): Promise<void> {
    try {
      do {
        fetch.isFollowUpRequested = false;
        fetch.editsSinceRequest = [];
        const annotations = await this.fetchOrReport(target);
        if (fetch.generation !== this.generation) {
          return;
        }
        if (annotations !== undefined) {
          this.entries.set(key, shiftSpans(annotations, fetch.editsSinceRequest));
          this.changeEmitter.fire(key);
        }
      } while (fetch.isFollowUpRequested);
    } finally {
      if (this.inFlight.get(key) === fetch) {
        this.inFlight.delete(key);
      }
    }
  }

  // A file the server cannot find has no annotations; other failures keep what is shown until the next refresh.
  private async fetchOrReport(target: AnnotationTarget): Promise<CodeAnnotation[] | undefined> {
    try {
      return await this.fetchAnnotations(target);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error;
      }
      this.reportError(target, error);
      return error.isNotFound ? [] : undefined;
    }
  }
}
