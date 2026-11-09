import type * as vscode from 'vscode';

export const TOKEN_SECRET_KEY = 'governedWorkflow.adminToken';

export class TokenStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async get(): Promise<string | undefined> {
    return await this.secrets.get(TOKEN_SECRET_KEY);
  }

  async set(token: string): Promise<void> {
    await this.secrets.store(TOKEN_SECRET_KEY, token);
  }

  async clear(): Promise<void> {
    await this.secrets.delete(TOKEN_SECRET_KEY);
  }
}
