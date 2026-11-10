import type { TabId } from '@shared/navigation';
import type { JSX, RefObject } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { Popover } from '../components/Popover';
import { classNames, toneClass } from '../components/types';
import { useT } from '../i18n/i18n';
import type { TabModule } from '../tabs/types';
import { columnGap, contentBoxWidth, observeContentResize, observeResize, renderedWidth, visibleTabIndices } from './layout';
import { useMenuFocus } from './menuFocus';

export interface TabBarProps {
  readonly modules: readonly TabModule[];
  readonly activeId: TabId;
  readonly onSelect: (id: TabId) => void;
}

const NO_BADGE = (): undefined => undefined;

export function tabElementId(id: TabId): string {
  return `gw-tab-${id}`;
}

export function tabPanelElementId(id: TabId): string {
  return `gw-tabpanel-${id}`;
}

export function rovingTabIndex(key: string, current: number, count: number): number | undefined {
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return undefined;
  }
}

function TabLabel({ module }: { readonly module: TabModule }): JSX.Element {
  const t = useT();
  const badge = (module.useBadge ?? NO_BADGE)();
  return (
    <>
      <Icon name={module.icon} />
      <span>{t(module.titleKey)}</span>
      {badge !== undefined && badge.count > 0 && <span class={classNames('gw-tab-badge', toneClass(badge.tone))}>{badge.count}</span>}
    </>
  );
}

interface TabButtonProps {
  readonly module: TabModule;
  readonly isActive: boolean;
  readonly isFocusable: boolean;
  readonly onSelect: (id: TabId) => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

function TabButton({ module, isActive, isFocusable, onSelect, onKeyDown }: TabButtonProps): JSX.Element {
  return (
    <button
      type="button"
      id={tabElementId(module.id)}
      role="tab"
      aria-selected={isActive}
      aria-controls={tabPanelElementId(module.id)}
      tabIndex={isFocusable ? 0 : -1}
      class={classNames('gw-tab', isActive && 'gw-tab-active')}
      onClick={() => onSelect(module.id)}
      onKeyDown={onKeyDown}
    >
      <TabLabel module={module} />
    </button>
  );
}

interface MoreTabsMenuProps {
  readonly hidden: readonly TabModule[];
  readonly onSelect: (id: TabId) => void;
}

// Tabs that do not fit whole are listed here rather than cut at the edge; keyboard users also reach them with the arrow keys.
function MoreTabsMenu({ hidden, onSelect }: MoreTabsMenuProps): JSX.Element {
  const t = useT();
  const label = t('vsc.tabs.more');
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [isOpen, setOpen] = useState(false);
  const select = (id: TabId): void => {
    setOpen(false);
    onSelect(id);
  };
  return (
    <>
      <button ref={setAnchor} type="button" class="gw-tab gw-tab-more" tabIndex={-1} title={label} aria-label={label} aria-haspopup="menu" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
        <Icon name="ellipsis" />
      </button>
      <Popover open={isOpen} anchor={anchor} onClose={() => setOpen(false)}>
        <HiddenTabItems hidden={hidden} label={label} onSelect={select} />
      </Popover>
    </>
  );
}

function HiddenTabItems({ hidden, label, onSelect }: MoreTabsMenuProps & { readonly label: string }): JSX.Element {
  const { menuRef, handleKeyDown } = useMenuFocus();
  return (
    <div ref={menuRef} class="gw-menu" role="menu" aria-label={label} onKeyDown={handleKeyDown}>
      {hidden.map((module) => (
        <button type="button" key={module.id} tabIndex={-1} role="menuitem" class="gw-menu-item gw-tab-menu-item" onClick={() => onSelect(module.id)}>
          <TabLabel module={module} />
        </button>
      ))}
    </div>
  );
}

// An invisible natural-width copy of every tab and of the "more" button, measured to decide which tabs fit whole.
function TabMeasure({ modules, measureRef }: { readonly modules: readonly TabModule[]; readonly measureRef: RefObject<HTMLDivElement> }): JSX.Element {
  return (
    <div ref={measureRef} class="gw-tab-measure" aria-hidden="true">
      {modules.map((module) => <span key={module.id} class="gw-tab"><TabLabel module={module} /></span>)}
      <span class="gw-tab gw-tab-more"><Icon name="ellipsis" /></span>
    </div>
  );
}

// Re-placed whenever the strip or any tab's natural width changes, or another tab becomes active.
function useVisibleTabs(stripRef: RefObject<HTMLElement>, measureRef: RefObject<HTMLElement>, activeIndex: number): readonly number[] | undefined {
  const [visible, setVisible] = useState<readonly number[] | undefined>(undefined);
  useLayoutEffect(() => {
    const [strip, measure] = [stripRef.current, measureRef.current];
    if (strip === null || measure === null) {
      return undefined;
    }
    const place = (): void => {
      const widths = Array.from(measure.children).map(renderedWidth);
      const moreWidth = widths.pop() ?? 0;
      const next = visibleTabIndices(widths, contentBoxWidth(strip), moreWidth, columnGap(measure), activeIndex);
      setVisible((current) => (current !== undefined && current.join() === next.join() ? current : next));
    };
    place();
    const stops = [observeResize(strip, place), observeContentResize(measure, place)];
    return () => stops.forEach((stop) => stop());
  }, [activeIndex]);
  return visible;
}

// Only whole tabs are shown; the ones that do not fit sit behind a "more tabs" menu at the end of the strip.
export function TabBar({ modules, activeId, onSelect }: TabBarProps): JSX.Element {
  const stripRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const activeIndex = modules.findIndex((module) => module.id === activeId);
  const visibleIndices = useVisibleTabs(stripRef, measureRef, activeIndex);
  const shown = visibleIndices === undefined ? modules : visibleIndices.map((index) => modules[index]);
  const hidden = modules.filter((module) => !shown.includes(module));
  const focusableId = activeIndex >= 0 ? activeId : modules[0]?.id;
  // The chosen tab is drawn into the strip on the next render, so focus follows it there once it exists.
  const selectAndFocus = (id: TabId): void => {
    onSelect(id);
    requestAnimationFrame(() => navRef.current?.querySelector<HTMLElement>(`#${tabElementId(id)}`)?.focus());
  };
  const handleKeyDown = (event: KeyboardEvent): void => {
    const next = rovingTabIndex(event.key, activeIndex, modules.length);
    const target = next === undefined ? undefined : modules[next];
    if (target !== undefined) {
      event.preventDefault();
      selectAndFocus(target.id);
    }
  };
  return (
    <div ref={stripRef} class="gw-tab-strip">
      <nav ref={navRef} class="gw-tabs gw-tabs-top gw-tab-bar" role="tablist" aria-orientation="horizontal">
        {shown.map((module) => (
          <TabButton key={module.id} module={module} isActive={module.id === activeId} isFocusable={module.id === focusableId} onSelect={onSelect} onKeyDown={handleKeyDown} />
        ))}
      </nav>
      {hidden.length > 0 && <MoreTabsMenu hidden={hidden} onSelect={selectAndFocus} />}
      <TabMeasure modules={modules} measureRef={measureRef} />
    </div>
  );
}
