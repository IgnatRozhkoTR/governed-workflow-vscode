import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError, AuthRequiredError } from '../api/errors';
import type { FileEntry } from '../api/types';
import { parseRemoteFileUri } from './uris';

const HTTP_BAD_REQUEST = 400;

export class RemoteFileSystem implements vscode.FileSystemProvider {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.changeEmitter.event;

  constructor(private readonly client: ApiClient) {}

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const { workspace, relPath } = parseRemoteFileUri(uri);
    if (relPath === '') {
      return directoryStat();
    }
    try {
      return fileStat(await this.client.getFileContent(workspace, relPath));
    } catch (error) {
      if (isDirectoryContentRejection(error) && (await this.readDirectory(uri)).length > 0) {
        return directoryStat();
      }
      throw toFileSystemError(uri, error);
    }
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const { workspace, relPath } = parseRemoteFileUri(uri);
    try {
      return await this.client.getFileContent(workspace, relPath);
    } catch (error) {
      throw toFileSystemError(uri, error);
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const { workspace, relPath } = parseRemoteFileUri(uri);
    try {
      const entries = await this.client.listFiles(workspace, relPath);
      return entries.map(toDirectoryEntry);
    } catch (error) {
      throw toFileSystemError(uri, error);
    }
  }

  createDirectory(uri: vscode.Uri): never {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  writeFile(uri: vscode.Uri): never {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  delete(uri: vscode.Uri): never {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  rename(oldUri: vscode.Uri): never {
    throw vscode.FileSystemError.NoPermissions(oldUri);
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}

function isDirectoryContentRejection(error: unknown): boolean {
  return error instanceof ApiError && error.status === HTTP_BAD_REQUEST;
}

function toDirectoryEntry(entry: FileEntry): [string, vscode.FileType] {
  if (entry.type === 'file') {
    return [entry.name, vscode.FileType.File];
  }
  return [firstPathSegment(entry.name), vscode.FileType.Directory];
}

function firstPathSegment(collapsedName: string): string {
  return collapsedName.split('/')[0];
}

function fileStat(content: Uint8Array): vscode.FileStat {
  const now = Date.now();
  return { type: vscode.FileType.File, ctime: now, mtime: now, size: content.byteLength };
}

function directoryStat(): vscode.FileStat {
  const now = Date.now();
  return { type: vscode.FileType.Directory, ctime: now, mtime: now, size: 0 };
}

function toFileSystemError(uri: vscode.Uri, error: unknown): unknown {
  if (error instanceof AuthRequiredError) {
    return vscode.FileSystemError.NoPermissions(error.message);
  }
  if (error instanceof ApiError && error.isNotFound) {
    return vscode.FileSystemError.FileNotFound(uri);
  }
  if (error instanceof ApiError) {
    return vscode.FileSystemError.Unavailable(`${uri.path}: ${error.message}`);
  }
  return error;
}
