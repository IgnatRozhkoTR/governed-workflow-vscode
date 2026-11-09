import type * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import { parseBaseFileUri } from './uris';

const BASE_REF_NOT_FOUND_CODE = 'base_ref_not_found';

export class BaseContentProvider implements vscode.TextDocumentContentProvider {
  private readonly decoder = new TextDecoder();

  constructor(private readonly client: ApiClient) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const { workspace, relPath, baseRef, repo } = parseBaseFileUri(uri);
    try {
      const content = await this.client.getFileContent(workspace, relPath, { ref: baseRef, repo });
      return this.decoder.decode(content);
    } catch (error) {
      // A file missing at the base ref was added on the branch, so its base side is empty.
      if (error instanceof ApiError && (error.isNotFound || error.code === BASE_REF_NOT_FOUND_CODE)) {
        return '';
      }
      throw error;
    }
  }
}
