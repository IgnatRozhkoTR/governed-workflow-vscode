import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import type { WorkspaceRef, WorkspaceState } from '../api/types';
import type { Settings } from '../config/settings';
import { StatePoller } from './statePoller';

export class ActiveWorkspace implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<WorkspaceRef | undefined>();
  private readonly stateEmitter = new vscode.EventEmitter<WorkspaceState>();
  private readonly pollEmitter = new vscode.EventEmitter<void>();
  private currentPoller: StatePoller | undefined;
  private currentState: WorkspaceState | undefined;
  private pollerSubscriptions: vscode.Disposable[] = [];
  private isPanelVisible = false;

  readonly onDidChange: vscode.Event<WorkspaceRef | undefined> = this.changeEmitter.event;
  readonly onDidChangeState: vscode.Event<WorkspaceState> = this.stateEmitter.event;
  readonly onDidPoll: vscode.Event<void> = this.pollEmitter.event;

  constructor(
    private readonly client: ApiClient,
    private readonly settings: Settings,
  ) {}

  get ref(): WorkspaceRef | undefined {
    return this.currentPoller?.workspace;
  }

  get poller(): StatePoller | undefined {
    return this.currentPoller;
  }

  get state(): WorkspaceState | undefined {
    return this.currentState;
  }

  setPanelVisible(isVisible: boolean): void {
    this.isPanelVisible = isVisible;
    this.currentPoller?.setPanelVisible(isVisible);
  }

  select(ref: WorkspaceRef): void {
    this.releasePoller();
    const poller = new StatePoller(ref, this.client, this.settings);
    this.currentPoller = poller;
    poller.setPanelVisible(this.isPanelVisible);
    this.pollerSubscriptions = [
      poller.onDidChange((state) => {
        this.currentState = state;
        this.stateEmitter.fire(state);
      }),
      poller.onDidPoll(() => this.pollEmitter.fire()),
    ];
    this.changeEmitter.fire(ref);
    poller.start();
  }

  dispose(): void {
    this.releasePoller();
    this.changeEmitter.dispose();
    this.stateEmitter.dispose();
    this.pollEmitter.dispose();
  }

  private releasePoller(): void {
    this.pollerSubscriptions.forEach((subscription) => subscription.dispose());
    this.pollerSubscriptions = [];
    this.currentPoller?.dispose();
    this.currentPoller = undefined;
    this.currentState = undefined;
  }
}
