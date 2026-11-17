import * as vscode from 'vscode';
import { parseOnSelectWorkspace, type OnSelectWorkspace } from '../worktree/onSelectWorkspace';

const CONFIG_SECTION = 'governedWorkflow';
const DEFAULT_SERVER_URL = 'http://localhost:5111';
const DEFAULT_POLL_INTERVAL_SECONDS = 10;
const MIN_POLL_INTERVAL_SECONDS = 3;
const ANNOTATIONS_ENABLED_KEY = 'annotations.enabled';

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

  get sshHost(): string | undefined {
    const configured = this.configuration().get<string>('sshHost', '').trim();
    return configured === '' ? undefined : configured;
  }

  get annotationsEnabled(): boolean {
    return this.configuration().get<boolean>(ANNOTATIONS_ENABLED_KEY, true);
  }

  // A workspace-level value would hide a user-level change, so the toggle writes where the value is set.
  async setAnnotationsEnabled(isEnabled: boolean): Promise<void> {
    const configuration = this.configuration();
    const isSetForWorkspace = configuration.inspect<boolean>(ANNOTATIONS_ENABLED_KEY)?.workspaceValue !== undefined;
    const target = isSetForWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await configuration.update(ANNOTATIONS_ENABLED_KEY, isEnabled, target);
  }

  get onSelectWorkspace(): OnSelectWorkspace {
    return parseOnSelectWorkspace(this.configuration().get<unknown>('onSelectWorkspace'));
  }

  dispose(): void {
    this.configurationListener.dispose();
    this.changeEmitter.dispose();
  }

  private configuration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }
}
