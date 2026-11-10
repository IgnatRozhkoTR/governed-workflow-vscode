import type { JSX } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import { Icon, IconButton, Popover } from '../../components';
import { useT } from '../../i18n/i18n';
import { useMenuFocus } from '../../shell/menuFocus';

export interface ChangesOverflowProps {
  readonly hasThreads: boolean;
  readonly isThreadsShown: boolean;
  readonly canOpenAll: boolean;
  readonly onToggleThreads: () => void;
  readonly onOpenAll: () => Promise<void>;
}

export function ChangesOverflow(props: ChangesOverflowProps): JSX.Element {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [isOpen, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const toggleMenu = (event: MouseEvent): void => {
    setAnchor(event.currentTarget as HTMLElement);
    setOpen(!isOpen);
  };
  return (
    <>
      <IconButton icon="ellipsis" title={t('vsc.changes.moreActions')} menuExpanded={isOpen} onClick={toggleMenu} />
      <Popover open={isOpen} anchor={anchor} onClose={close}>
        <ChangesMenu {...props} onClose={close} />
      </Popover>
    </>
  );
}

function ChangesMenu({ hasThreads, isThreadsShown, canOpenAll, onToggleThreads, onOpenAll, onClose }: ChangesOverflowProps & { readonly onClose: () => void }): JSX.Element {
  const t = useT();
  const { menuRef, handleKeyDown } = useMenuFocus();
  const runAndClose = (action: () => void): void => {
    onClose();
    action();
  };
  return (
    <div ref={menuRef} class="gw-menu gw-changes-overflow" role="menu" aria-label={t('vsc.changes.moreActions')} onKeyDown={handleKeyDown}>
      <ChangesMenuItem icon="files" label={t('vsc.changes.openAll')} isDisabled={!canOpenAll} onSelect={() => runAndClose(() => void onOpenAll())} />
      {hasThreads && (
        <ChangesMenuItem icon="comment-discussion" label={t(isThreadsShown ? 'vsc.changes.hideThreads' : 'vsc.changes.showThreads')} onSelect={() => runAndClose(onToggleThreads)} />
      )}
    </div>
  );
}

interface ChangesMenuItemProps {
  readonly icon: string;
  readonly label: string;
  readonly isDisabled?: boolean;
  readonly onSelect: () => void;
}

function ChangesMenuItem({ icon, label, isDisabled = false, onSelect }: ChangesMenuItemProps): JSX.Element {
  return (
    <button type="button" tabIndex={-1} role="menuitem" class="gw-menu-item gw-changes-menu-item" disabled={isDisabled} onClick={onSelect}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}
