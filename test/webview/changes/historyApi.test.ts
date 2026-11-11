import { beforeEach, describe, expect, it, vi } from 'vitest';
import { historyRename, historySquash, historyUndo } from '../../../webview-ui/src/api/changes';
import { apiPost } from '../../../webview-ui/src/api/request';

vi.mock('../../../webview-ui/src/api/request', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  ws: (suffix: string) => `/ws/${suffix}`,
}));

beforeEach(() => {
  vi.mocked(apiPost).mockReset();
});

describe('history mutations', () => {
  it('historyRename_shouldSendRepo_whenRepoGiven', async () => {
    await historyRename('abc', 'msg', 'qa-api');
    expect(apiPost).toHaveBeenCalledWith('/ws/history/rename', { sha: 'abc', message: 'msg', repo: 'qa-api' });
  });

  it('historyUndo_shouldSendRepo_whenRepoGiven', async () => {
    await historyUndo('qa-api');
    expect(apiPost).toHaveBeenCalledWith('/ws/history/undo', { repo: 'qa-api' });
  });

  it('historySquash_shouldSendRepo_whenRepoGiven', async () => {
    await historySquash(['a', 'b'], 'msg', 'qa-api');
    expect(apiPost).toHaveBeenCalledWith('/ws/history/squash', { commits: ['a', 'b'], message: 'msg', repo: 'qa-api' });
  });

  it('historyMutations_shouldOmitRepo_whenRepoEmptyOrMissing', async () => {
    await historyRename('abc', 'msg', '');
    await historyUndo();
    await historySquash(['a', 'b'], 'msg');
    expect(vi.mocked(apiPost).mock.calls.map(([, body]) => body)).toEqual([{ sha: 'abc', message: 'msg' }, {}, { commits: ['a', 'b'], message: 'msg' }]);
  });
});
