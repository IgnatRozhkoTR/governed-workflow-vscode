import { TAB_ORDER, type NavTarget, type TabId } from '@shared/navigation';
import { isLocale } from '@shared/protocol';
import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { DialogHost, EmptyState, SetPhaseDialog, ToastHost, useToast } from '../components';
import { loadLocaleMessages, registerModuleMessages, useT } from '../i18n/i18n';
import { SHELL_MESSAGES } from '../i18n/messages';
import { useNav, useStore } from '../store/hooks';
import { store } from '../store/store';
import { SETTINGS_SECTIONS } from '../tabs/settings/sections';
import type { TabModule } from '../tabs/types';
import { ConnectionBanner, NoWorkspace } from './ConnectionBanner';
import { Header } from './Header';
import { TabBar } from './TabBar';

export interface AppProps {
  readonly modules: readonly TabModule[];
}

function registerAllMessages(modules: readonly TabModule[]): void {
  registerModuleMessages(SHELL_MESSAGES);
  [...modules, ...SETTINGS_SECTIONS].forEach((module) => module.messages !== undefined && registerModuleMessages(module.messages));
}

function useLocaleSync(): void {
  const toast = useToast();
  const stateLocale = useStore((s) => s.state?.locale);
  const storeLocale = useStore((s) => s.locale);
  useEffect(() => {
    if (isLocale(stateLocale) && stateLocale !== storeLocale) {
      loadLocaleMessages(stateLocale).then(() => store.setLocale(stateLocale), toast.error);
    }
  }, [stateLocale, storeLocale]);
}

function useVisitedTabs(activeId: TabId): ReadonlySet<TabId> {
  const [visited, setVisited] = useState<ReadonlySet<TabId>>(() => new Set([activeId]));
  useEffect(() => {
    if (!visited.has(activeId)) {
      setVisited(new Set([...visited, activeId]));
    }
  }, [activeId]);
  return visited.has(activeId) ? visited : new Set([...visited, activeId]);
}

export function App({ modules }: AppProps): JSX.Element {
  useState(() => registerAllMessages(modules));
  useLocaleSync();
  useT();
  const hasState = useStore((s) => s.state !== null);
  return (
    <div class="gw-app">
      <ConnectionBanner />
      {hasState ? <Workspace modules={modules} /> : <NoWorkspace />}
      <DialogHost />
      <ToastHost />
    </div>
  );
}

function Workspace({ modules }: AppProps): JSX.Element {
  const [nav, navigate] = useNav();
  const ordered = useMemo(() => TAB_ORDER.flatMap((id) => modules.filter((module) => module.id === id)), [modules]);
  const visited = useVisitedTabs(nav.tab);
  const clearAction = (): void => navigate({ ...nav, action: undefined });
  return (
    <>
      <Header />
      <TabBar modules={ordered} activeId={nav.tab} onSelect={(tab) => navigate({ tab })} />
      <main class="gw-tab-panels">
        {ordered.filter((module) => visited.has(module.id)).map((module) => (
          <TabPanel key={module.id} module={module} nav={nav} isActive={module.id === nav.tab} />
        ))}
        {!ordered.some((module) => module.id === nav.tab) && <UnavailableTab />}
      </main>
      <SetPhaseDialog open={nav.action === 'setPhase'} onClose={clearAction} />
    </>
  );
}

function TabPanel({ module, nav, isActive }: { readonly module: TabModule; readonly nav: NavTarget; readonly isActive: boolean }): JSX.Element {
  const { Component } = module;
  return (
    <section class="gw-tab-panel" role="tabpanel" hidden={!isActive}>
      <Component active={isActive} nav={isActive ? nav : { tab: module.id }} />
    </section>
  );
}

function UnavailableTab(): JSX.Element {
  const t = useT();
  return <EmptyState icon="circle-slash" message={t('vsc.shell.tabUnavailable')} />;
}
