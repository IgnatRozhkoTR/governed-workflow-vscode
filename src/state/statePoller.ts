import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError, AuthRequiredError } from '../api/errors';
import type { WorkspaceRef, WorkspaceState } from '../api/types';
import type { Settings } from '../config/settings';

const MILLISECONDS_PER_SECOND = 1000;
const FIRST_LOAD_RETRY_BASE_MS = 500;
const VISIBLE_PANEL_POLL_SECONDS = 3;

export class StatePoller implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<WorkspaceState>();
  private readonly authRequiredEmitter = new vscode.EventEmitter<void>();
  private readonly failureEmitter = new vscode.EventEmitter<ApiError>();
  private windowStateListener: vscode.Disposable | undefined;
  private timer: NodeJS.Timeout | undefined;
  private refreshInFlight: Promise<void> | undefined;
  private isFollowUpRefreshRequested = false;
  private etag: string | undefined;
  private isPanelVisible = false;
  private hasLoadedState = false;
  private failedAttemptsBeforeFirstState = 0;

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

  setPanelVisible(isVisible: boolean): void {
    if (this.isPanelVisible === isVisible) {
      return;
    }
    this.isPanelVisible = isVisible;
    if (this.timer !== undefined) {
      this.scheduleNextPoll();
    }
  }

  start(): void {
    if (this.isRunning) {
      return;
    }
    this.listenToWindowState();
    void this.refreshNow();
  }

  stop(): void {
    this.windowStateListener?.dispose();
    this.windowStateListener = undefined;
    this.isFollowUpRefreshRequested = false;
    this.cancelScheduledPoll();
  }

  // Only one fetch runs at a time, so a slow response can never overwrite a newer state or etag.
  // A refresh requested mid-flight runs once after it, because the caller may expect a change made meanwhile.
  refreshNow(): Promise<void> {
    this.cancelScheduledPoll();
    this.listenToWindowState();
    if (this.refreshInFlight !== undefined) {
      this.isFollowUpRefreshRequested = true;
      return this.refreshInFlight;
    }
    this.refreshInFlight = this.runRefreshCycle();
    return this.refreshInFlight;
  }

  dispose(): void {
    this.stop();
    this.changeEmitter.dispose();
    this.authRequiredEmitter.dispose();
    this.failureEmitter.dispose();
  }

  private async runRefreshCycle(): Promise<void> {
    try {
      do {
        this.isFollowUpRefreshRequested = false;
        await this.fetchState();
      } while (this.isFollowUpRefreshRequested);
    } finally {
      this.refreshInFlight = undefined;
      this.scheduleNextPoll();
    }
  }

  private listenToWindowState(): void {
    this.windowStateListener ??= vscode.window.onDidChangeWindowState((state) => this.handleWindowState(state));
  }

  private handleWindowState(state: vscode.WindowState): void {
    if (state.focused) {
      void this.refreshNow();
    } else if (this.hasLoadedState) {
      this.cancelScheduledPoll();
    }
  }

  private async fetchState(): Promise<void> {
    try {
      const result = await this.client.getState(this.workspace, this.etag);
      this.hasLoadedState = true;
      if (!result.notModified) {
        this.etag = result.etag;
        this.changeEmitter.fire(result.state);
      }
    } catch (error) {
      this.handleFetchError(error);
    }
  }

  private handleFetchError(error: unknown): void {
    if (!this.hasLoadedState) {
      this.failedAttemptsBeforeFirstState++;
    }
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
    if (!this.isRunning) {
      return;
    }
    if (!this.hasLoadedState) {
      this.timer = setTimeout(() => void this.refreshNow(), this.firstLoadRetryDelay());
    } else if (vscode.window.state.focused) {
      this.timer = setTimeout(() => void this.refreshNow(), this.focusedPollIntervalMs());
    }
  }

  private focusedPollIntervalMs(): number {
    const seconds = this.isPanelVisible ? VISIBLE_PANEL_POLL_SECONDS : this.settings.pollIntervalSeconds;
    return seconds * MILLISECONDS_PER_SECOND;
  }

  private firstLoadRetryDelay(): number {
    const backoff = FIRST_LOAD_RETRY_BASE_MS * 2 ** Math.max(0, this.failedAttemptsBeforeFirstState - 1);
    return Math.min(backoff, this.settings.pollIntervalSeconds * MILLISECONDS_PER_SECOND);
  }

  private cancelScheduledPoll(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
