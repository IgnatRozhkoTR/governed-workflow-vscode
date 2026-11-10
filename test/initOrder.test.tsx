// @vitest-environment happy-dom
import { PROTOCOL_VERSION, type RpcMethod, type WebviewMessage } from '@shared/protocol';
import { waitFor } from '@testing-library/preact';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLocaleMessages, t } from '../webview-ui/src/i18n/i18n';
import { App } from '../webview-ui/src/shell/App';
import { store } from '../webview-ui/src/store/store';
import { makeState } from './support/fixtures';

const WORKSPACE = { projectId: 'p', branch: 'b' };
const SERVER_MESSAGES = { 'header.switch': 'Switch workspace' };

const posted: WebviewMessage[] = [];
vi.stubGlobal('acquireVsCodeApi', () => ({
  postMessage: (message: WebviewMessage) => posted.push(message),
  getState: () => undefined,
  setState: () => undefined,
}));

const REPLIES: Partial<Record<RpcMethod, unknown>> = {
  'workspace.snapshot': { workspace: WORKSPACE, state: makeState(), etag: '"1"' },
  'i18n.load': SERVER_MESSAGES,
};

let container: HTMLElement;

function reply(method: RpcMethod): void {
  const request = posted.findLast((message) => message.kind === 'request' && message.method === method);
  if (request?.kind !== 'request') {
    throw new Error(`The panel did not request "${method}".`);
  }
  window.dispatchEvent(new MessageEvent('message', { data: { kind: 'response', id: request.id, ok: true, result: REPLIES[method] } }));
}

// Mirrors main.tsx: render first, then fire both requests; the replies land before Preact runs the post-paint subscription effects.
async function startPanelWithRepliesIn(order: readonly RpcMethod[]): Promise<void> {
  store.initialize({ protocol: PROTOCOL_VERSION, snapshot: { workspace: WORKSPACE, state: null, etag: null }, nav: { tab: 'settings' }, locale: 'en' });
  render(<App modules={[]} />, container);
  const pending = Promise.all([loadLocaleMessages('en'), store.syncSnapshot()]);
  order.forEach(reply);
  await pending;
}

beforeEach(() => {
  posted.length = 0;
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

describe('panel initialization order', () => {
  it.each([
    ['snapshot first', ['workspace.snapshot', 'i18n.load']],
    ['i18n first', ['i18n.load', 'workspace.snapshot']],
  ] as const)('startPanel_shouldRenderWorkspace_whenRepliesArriveBeforeSubscriptions_%s', async (_name, order) => {
    await startPanelWithRepliesIn(order);

    expect(t('header.switch')).toBe('Switch workspace');
    await waitFor(() => expect(container.querySelector('[role=tablist]')).not.toBeNull());
    expect(container.textContent).not.toContain('Loading…');
  });
});
