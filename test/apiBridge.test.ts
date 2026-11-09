import type { ApiRequest, ApiResponse } from '@shared/protocol';
import { describe, expect, it, vi } from 'vitest';
import { handleApiRequest, isAllowedApiPath } from '../src/webview/apiBridge';

describe('isAllowedApiPath', () => {
  it.each([
    '/api/ws/proj/feature%2Fx/state',
    '/api/phases/available',
    '/api/projects/my%20proj/workspaces',
    '/api/ws/proj/feature(1)/file/a!b\'c*.ts',
  ])('isAllowedApiPath_shouldAccept_whenPathIsInsideApi: %s', (path) => {
    expect(isAllowedApiPath(path)).toBe(true);
  });

  it.each([
    '/i18n/en.json',
    '/api/../x',
    '/api//x',
    'http://x/api/',
    '/api/%2e%2e/x',
    '/api/ws/%E0%A4%A/state',
    '/api/x?y=1',
    '/api/x#y',
    'api/x',
  ])('isAllowedApiPath_shouldReject_whenPathEscapesApi: %s', (path) => {
    expect(isAllowedApiPath(path)).toBe(false);
  });
});

describe('handleApiRequest', () => {
  const response: ApiResponse = { status: 200, body: { ok: true } };

  it('handleApiRequest_shouldForwardRequest_whenValid', async () => {
    const request = vi.fn(async () => response);
    const spec: ApiRequest = { method: 'PUT', path: '/api/ws/p/b/yolo', body: { enabled: true }, query: { a: 1, b: undefined } };

    await expect(handleApiRequest({ request }, spec)).resolves.toBe(response);
    expect(request).toHaveBeenCalledWith(spec);
  });

  it('handleApiRequest_shouldThrowForbiddenPath_whenPathIsOutsideApi', async () => {
    const request = vi.fn(async () => response);

    await expect(handleApiRequest({ request }, { method: 'GET', path: '/i18n/en.json' })).rejects.toMatchObject({ code: 'forbidden_path' });
    expect(request).not.toHaveBeenCalled();
  });

  it('handleApiRequest_shouldThrowForbiddenPath_whenMethodIsUnknown', async () => {
    const spec = { method: 'PATCH', path: '/api/x' } as unknown as ApiRequest;

    await expect(handleApiRequest({ request: vi.fn() }, spec)).rejects.toMatchObject({ code: 'forbidden_path' });
  });

  it('handleApiRequest_shouldThrowForbiddenPath_whenQueryHoldsObjects', async () => {
    const spec = { method: 'GET', path: '/api/x', query: { nested: { a: 1 } } } as unknown as ApiRequest;

    await expect(handleApiRequest({ request: vi.fn() }, spec)).rejects.toMatchObject({ code: 'forbidden_path' });
  });
});
