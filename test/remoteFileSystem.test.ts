import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => {
  class EventEmitter<T> {
    private listeners: ((value: T) => void)[] = [];
    event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };
    fire(value: T): void {
      this.listeners.forEach((listener) => listener(value));
    }
    dispose(): void {}
  }
  const failure = (name: string) => (message: unknown) => Object.assign(new Error(String(message)), { name });
  return {
    EventEmitter,
    Disposable: class {
      constructor(readonly callOnDispose: () => void) {}
    },
    FileType: { File: 1, Directory: 2 },
    FileChangeType: { Changed: 1 },
    FileSystemError: {
      NoPermissions: failure('NoPermissions'),
      FileNotFound: failure('FileNotFound'),
      Unavailable: failure('Unavailable'),
    },
  };
});

import { ApiError } from '../src/api/errors';
import { RemoteFileSystem, REMOTE_FS_READONLY } from '../src/fs/remoteFileSystem';
import { remoteFileUriParts } from '../src/fs/uris';

const WORKSPACE = { projectId: 'proj', branch: 'feature/x' };

function uriFor(relPath: string) {
  const parts = remoteFileUriParts({ workspace: WORKSPACE, relPath });
  return { ...parts, path: parts.path, with: () => undefined, toString: () => 'uri' } as never;
}

describe('RemoteFileSystem.writeFile', () => {
  it('writeFile_shouldSendUtf8TextAndFireChange_whenContentIsText', async () => {
    const writeFile = vi.fn(async () => undefined);
    const fileSystem = new RemoteFileSystem({ writeFile } as never);
    const changes = vi.fn();
    fileSystem.onDidChangeFile(changes);
    await fileSystem.writeFile(uriFor('src/a.ts'), new TextEncoder().encode('héllo'));
    expect(writeFile).toHaveBeenCalledWith(WORKSPACE, 'src/a.ts', 'héllo');
    expect(changes).toHaveBeenCalledOnce();
  });

  it('writeFile_shouldRejectWithNoPermissions_whenContentIsBinary', async () => {
    const writeFile = vi.fn();
    const fileSystem = new RemoteFileSystem({ writeFile } as never);
    await expect(fileSystem.writeFile(uriFor('a.bin'), new Uint8Array([0xff, 0xfe, 0x00]))).rejects.toMatchObject({
      name: 'NoPermissions',
    });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('writeFile_shouldMapApiErrors_whenServerRejects', async () => {
    const writeFile = vi.fn().mockRejectedValue(new ApiError(403, 'forbidden', 'outside'));
    const fileSystem = new RemoteFileSystem({ writeFile } as never);
    await expect(fileSystem.writeFile(uriFor('a.ts'), new TextEncoder().encode('x'))).rejects.toMatchObject({ name: 'Unavailable' });
  });

  it('REMOTE_FS_READONLY_shouldBeFalse', () => {
    expect(REMOTE_FS_READONLY).toBe(false);
  });
});
