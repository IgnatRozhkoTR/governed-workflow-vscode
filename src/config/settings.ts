import * as vscode from 'vscode';

const CONFIG_SECTION = 'governedWorkflow';
const DEFAULT_SERVER_URL = 'http://localhost:5111';
const DEFAULT_POLL_INTERVAL_SECONDS = 10;
const MIN_POLL_INTERVAL_SECONDS = 3;

export class Settings implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly configurationListener: vscode.Disposable;

  readonly onDidChange: vscode.Event<void> = this.changeEmitter.event;

  constructor() {
    this.configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_SECTION)) {
        this.changeEmitter.fire();
      }
    });
  }

  get serverUrl(): string {
    const configured = this.configuration().get<string>('serverUrl', DEFAULT_SERVER_URL);
    return configured.trim().replace(/\/+$/, '');
  }

  get pollIntervalSeconds(): number {
    const configured = this.configuration().get<number>('pollIntervalSeconds', DEFAULT_POLL_INTERVAL_SECONDS);
    return Number.isFinite(configured) ? Math.max(configured, MIN_POLL_INTERVAL_SECONDS) : DEFAULT_POLL_INTERVAL_SECONDS;
  }

  dispose(): void {
    this.configurationListener.dispose();
    this.changeEmitter.dispose();
  }

  private configuration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }
}
