import { TAB_ORDER, type NavTarget, type TabId } from '@shared/navigation';
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DialogHost, EmptyState, SetPhaseDialog, ToastHost, useToast } from '../components';
import { registerModuleMessages, useT } from '../i18n/i18n';
import { SHELL_MESSAGES } from '../i18n/messages';
import { useNav, useStore } from '../store/hooks';
import { store } from '../store/store';
import { SETTINGS_SECTIONS } from '../tabs/settings/sections';
import type { TabModule } from '../tabs/types';
import { ConnectionBanner, NoWorkspace } from './ConnectionBanner';
import { DecisionBar } from './DecisionBar';
import { Header } from './Header';
import { SHELL_LAYOUT_MESSAGES } from './messages';
import { TabBar, tabElementId, tabPanelElementId } from './TabBar';
import { TabModulesContext } from './tabTitles';
import './shell.css';

const STICKY_TOP_HEIGHT_PROPERTY = '--gw-sticky-top-height';

export interface AppProps {
  readonly modules: readonly TabModule[];
}

function registerAllMessages(modules: readonly TabModule[]): void {
  registerModuleMessages(SHELL_MESSAGES);
  registerModuleMessages(SHELL_LAYOUT_MESSAGES);
  [...modules, ...SETTINGS_SECTIONS].forEach((module) => module.messages !== undefined && registerModuleMessages(module.messages));
}

// Screen readers pick pronunciation, and CSS `hyphens: auto` picks its dictionary, from the document language.
function useDocumentLanguage(): void {
  const locale = useStore((s) => s.locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
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

// Anchored scrolling keeps targets below the sticky header, tabs and decision bar, so it needs their live height,
// which changes as the header wraps and the decision bar comes and goes.
function useStickyTopHeight(): { readonly current: HTMLDivElement | null } {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }
    const publish = (): void => document.documentElement.style.setProperty(STICKY_TOP_HEIGHT_PROPERTY, `${element.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return ref;
}

export function App({ modules }: AppProps): JSX.Element {
  useState(() => registerAllMessages(modules));
  useDocumentLanguage();
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
  const toast = useToast();
  const ordered = useMemo(() => TAB_ORDER.flatMap((id) => modules.filter((module) => module.id === id)), [modules]);
  const visited = useVisitedTabs(nav.tab);
  const clearAction = (): void => navigate({ ...nav, action: undefined });
  const stickyTopRef = useStickyTopHeight();
  return (
    <TabModulesContext.Provider value={ordered}>
      <div ref={stickyTopRef} class="gw-sticky-top">
        <Header />
        <TabBar modules={ordered} activeId={nav.tab} onSelect={(tab) => void store.selectTab(tab).catch(toast.error)} />
        <DecisionBar />
      </div>
      <main id="gw-main" class="gw-tab-panels" tabIndex={-1}>
        {ordered.filter((module) => visited.has(module.id)).map((module) => (
          <TabPanel key={module.id} module={module} nav={nav} isActive={module.id === nav.tab} />
        ))}
        {!ordered.some((module) => module.id === nav.tab) && <UnavailableTab />}
      </main>
      <SetPhaseDialog open={nav.action === 'setPhase'} onClose={clearAction} />
    </TabModulesContext.Provider>
  );
}

function TabPanel({ module, nav, isActive }: { readonly module: TabModule; readonly nav: NavTarget; readonly isActive: boolean }): JSX.Element {
  const { Component } = module;
  return (
    <section id={tabPanelElementId(module.id)} class="gw-tab-panel" role="tabpanel" aria-labelledby={tabElementId(module.id)} hidden={!isActive}>
      <Component active={isActive} nav={isActive ? nav : { tab: module.id }} />
    </section>
  );
}

function UnavailableTab(): JSX.Element {
  const t = useT();
  return <EmptyState icon="circle-slash" message={t('vsc.shell.tabUnavailable')} />;
}
