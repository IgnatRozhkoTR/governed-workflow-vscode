import * as vscode from 'vscode';

export const DOC_SCHEME = 'gw-doc';

export class MarkdownDocProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly contentByKey = new Map<string, string>();
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();

  readonly onDidChange: vscode.Event<vscode.Uri> = this.changeEmitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contentByKey.get(uri.path) ?? '';
  }

  uriFor(key: string, markdown: string): vscode.Uri {
    const path = `/${key}.md`;
    this.contentByKey.set(path, markdown);
    const uri = vscode.Uri.from({ scheme: DOC_SCHEME, path });
    this.changeEmitter.fire(uri);
    return uri;
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  async preview(key: string, markdown: string): Promise<void> {
    await vscode.commands.executeCommand('markdown.showPreview', this.uriFor(key, markdown));
  }
}

export interface MarkdownDocDeps {
  readonly docs: MarkdownDocProvider;
}

export function registerMarkdownDocs(context: vscode.ExtensionContext, deps: MarkdownDocDeps): void {
  context.subscriptions.push(deps.docs, vscode.workspace.registerTextDocumentContentProvider(DOC_SCHEME, deps.docs));
}
