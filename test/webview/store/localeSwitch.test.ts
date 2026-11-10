// @vitest-environment happy-dom
import type { Locale } from '@shared/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentLocale, t } from '../../../webview-ui/src/i18n/i18n';
import { rpc } from '../../../webview-ui/src/rpc/rpcClient';
import { WorkspaceStore } from '../../../webview-ui/src/store/store';
import { makeState } from '../../support/fixtures';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

const KEY = 'tabs.settings';
const MESSAGES: Readonly<Record<Locale, Record<string, string>>> = { en: { [KEY]: 'Settings' }, ru: { [KEY]: 'Настройки' } };
const WORKSPACE = { projectId: 'p', branch: 'b' };

interface PendingLoad {
  readonly locale: Locale;
  readonly resolve: () => void;
}

let pendingLoads: PendingLoad[];

beforeEach(() => {
  pendingLoads = [];
  vi.spyOn(rpc, 'call').mockImplementation(((_method: string, params: { locale: Locale }) =>
    new Promise((resolve) => pendingLoads.push({ locale: params.locale, resolve: () => resolve(MESSAGES[params.locale]) }))) as typeof rpc.call);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function resolveLoad(locale: Locale): Promise<void> {
  const load = pendingLoads.find((entry) => entry.locale === locale);
  if (load === undefined) {
    throw new Error(`No pending i18n.load for ${locale}`);
  }
  load.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function snapshotWithLocale(locale: Locale): { workspace: typeof WORKSPACE; state: ReturnType<typeof makeState>; etag: string } {
  return { workspace: WORKSPACE, state: makeState({ locale }), etag: `"${locale}"` };
}

async function storeShowingEnglish(): Promise<WorkspaceStore> {
  const store = new WorkspaceStore();
  store.applySnapshot(snapshotWithLocale('en'));
  void store.changeLocale('en');
  await resolveLoad('en');
  pendingLoads = [];
  return store;
}

describe('locale switching', () => {
  it('changeLocale_shouldKeepOldLocaleAndMessages_untilNewMessagesArrive', async () => {
    const store = await storeShowingEnglish();
    const switching = store.changeLocale('ru');
    expect(store.getSnapshot().locale).toBe('en');
    expect(t(KEY)).toBe('Settings');
    await resolveLoad('ru');
    await switching;
    expect(store.getSnapshot().locale).toBe('ru');
    expect(currentLocale()).toBe('ru');
    expect(t(KEY)).toBe('Настройки');
  });

  it('changeLocale_shouldKeepLatestChoice_whenEarlierLoadResolvesLast', async () => {
    const store = await storeShowingEnglish();
    void store.changeLocale('ru');
    void store.changeLocale('en');
    await resolveLoad('en');
    await resolveLoad('ru');
    expect(store.getSnapshot().locale).toBe('en');
    expect(t(KEY)).toBe('Settings');
  });

  it('applySnapshot_shouldNotRevertUserSwitch_whenStalePollStillCarriesOldLocale', async () => {
    const store = await storeShowingEnglish();
    void store.changeLocale('ru');
    await resolveLoad('ru');
    store.applySnapshot(snapshotWithLocale('en'));
    expect(pendingLoads.filter((load) => load.locale === 'en')).toHaveLength(0);
    expect(store.getSnapshot().locale).toBe('ru');
  });

  it('applySnapshot_shouldFollowServer_whenWorkspaceLocaleChangesElsewhere', async () => {
    const store = await storeShowingEnglish();
    store.applySnapshot(snapshotWithLocale('ru'));
    await resolveLoad('ru');
    expect(store.getSnapshot().locale).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
  });
});
