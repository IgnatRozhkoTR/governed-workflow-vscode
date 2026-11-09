import * as vscode from 'vscode';

export type AnnotationKind = 'info' | 'warning' | 'error';

export interface Annotation {
  readonly range: vscode.Range;
  readonly kind: AnnotationKind;
  readonly message: string;
}

export interface AnnotationProvider {
  provideAnnotations(uri: vscode.Uri): Promise<Annotation[]>;
}

const KIND_COLORS: Readonly<Record<AnnotationKind, string>> = {
  info: 'editorInfo.foreground',
  warning: 'editorWarning.foreground',
  error: 'editorError.foreground',
};

export class AnnotationRegistry implements vscode.Disposable {
  private readonly providers = new Set<AnnotationProvider>();
  private readonly decorationTypes = new Map<AnnotationKind, vscode.TextEditorDecorationType>();
  private readonly errorLog = vscode.window.createOutputChannel('Governed Workflow Annotations');
  private readonly listener: vscode.Disposable;

  constructor() {
    for (const kind of Object.keys(KIND_COLORS) as AnnotationKind[]) {
      this.decorationTypes.set(kind, this.createDecorationType(kind));
    }
    this.listener = vscode.window.onDidChangeVisibleTextEditors(() => void this.apply());
  }

  register(provider: AnnotationProvider): vscode.Disposable {
    this.providers.add(provider);
    void this.apply();
    return new vscode.Disposable(() => {
      this.providers.delete(provider);
      void this.apply();
    });
  }

  async apply(): Promise<void> {
    await Promise.all(vscode.window.visibleTextEditors.map((editor) => this.applyToEditor(editor)));
  }

  dispose(): void {
    this.listener.dispose();
    this.errorLog.dispose();
    this.decorationTypes.forEach((type) => type.dispose());
  }

  private async applyToEditor(editor: vscode.TextEditor): Promise<void> {
    const annotations = await this.collect(editor.document.uri);
    for (const [kind, type] of this.decorationTypes) {
      const options = annotations
        .filter((annotation) => annotation.kind === kind)
        .map((annotation) => ({ range: annotation.range, hoverMessage: annotation.message }));
      editor.setDecorations(type, options);
    }
  }

  private async collect(uri: vscode.Uri): Promise<Annotation[]> {
    const results = await Promise.allSettled([...this.providers].map((provider) => provider.provideAnnotations(uri)));
    const annotations: Annotation[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        annotations.push(...result.value);
      } else {
        this.errorLog.appendLine(`Annotation provider failed for ${uri.toString()}: ${String(result.reason)}`);
      }
    }
    return annotations;
  }

  private createDecorationType(kind: AnnotationKind): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
      textDecoration: 'underline wavy',
      color: new vscode.ThemeColor(KIND_COLORS[kind]),
      overviewRulerColor: new vscode.ThemeColor(KIND_COLORS[kind]),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
  }
}

export function registerAnnotations(context: vscode.ExtensionContext): AnnotationRegistry {
  const registry = new AnnotationRegistry();
  context.subscriptions.push(registry);
  return registry;
}
