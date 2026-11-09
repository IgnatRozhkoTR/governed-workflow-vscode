import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError, AuthRequiredError } from '../api/errors';
import type { WorkspaceRef, WorkspaceState } from '../api/types';
import type { Settings } from '../config/settings';

const MILLISECONDS_PER_SECOND = 1000;

export class StatePoller implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<WorkspaceState>();
  private readonly authRequiredEmitter = new vscode.EventEmitter<void>();
  private readonly failureEmitter = new vscode.EventEmitter<ApiError>();
  private windowStateListener: vscode.Disposable | undefined;
  private timer: NodeJS.Timeout | undefined;
  private etag: string | undefined;

  readonly onDidChange: vscode.Event<WorkspaceState> = this.changeEmitter.event;
  readonly onAuthRequired: vscode.Event<void> = this.authRequiredEmitter.event;
  readonly onDidFail: vscode.Event<ApiError> = this.failureEmitter.event;

  constructor(
    readonly workspace: WorkspaceRef,
    private readonly client: ApiClient,
    private readonly settings: Settings,
  ) {}

  get currentEtag(): string | undefined {
    return this.etag;
  }

  get isRunning(): boolean {
    return this.windowStateListener !== undefined;
  }

  start(): void {
    if (this.isRunning) {
      return;
    }
    this.listenToWindowState();
    this.handleWindowState(vscode.window.state);
  }

  stop(): void {
    this.windowStateListener?.dispose();
    this.windowStateListener = undefined;
    this.cancelScheduledPoll();
  }

  async refreshNow(): Promise<void> {
    this.cancelScheduledPoll();
    this.listenToWindowState();
    await this.fetchState();
    this.scheduleNextPoll();
  }

  dispose(): void {
    this.stop();
    this.changeEmitter.dispose();
    this.authRequiredEmitter.dispose();
    this.failureEmitter.dispose();
  }

  private listenToWindowState(): void {
    this.windowStateListener ??= vscode.window.onDidChangeWindowState((state) => this.handleWindowState(state));
  }

  private handleWindowState(state: vscode.WindowState): void {
    if (state.focused) {
      void this.refreshNow();
    } else {
      this.cancelScheduledPoll();
    }
  }

  private async fetchState(): Promise<void> {
    try {
      const result = await this.client.getState(this.workspace, this.etag);
      if (!result.notModified) {
        this.etag = result.etag;
        this.changeEmitter.fire(result.state);
      }
    } catch (error) {
      this.handleFetchError(error);
    }
  }

  private handleFetchError(error: unknown): void {
    // Forgetting the etag makes the next successful poll deliver the full state, which tells listeners the connection recovered.
    this.etag = undefined;
    if (error instanceof AuthRequiredError) {
      this.stop();
      this.authRequiredEmitter.fire();
    } else if (error instanceof ApiError) {
      this.failureEmitter.fire(error);
    } else {
      throw error;
    }
  }

  private scheduleNextPoll(): void {
    this.cancelScheduledPoll();
    if (!this.isRunning || !vscode.window.state.focused) {
      return;
    }
    const delay = this.settings.pollIntervalSeconds * MILLISECONDS_PER_SECOND;
    this.timer = setTimeout(() => void this.refreshNow(), delay);
  }

  private cancelScheduledPoll(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
