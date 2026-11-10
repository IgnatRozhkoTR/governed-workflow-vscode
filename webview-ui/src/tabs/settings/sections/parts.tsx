import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useMutation, type MutationOptions } from '../../../store/hooks';
import { toasts } from '../../../components/ToastHost';
import { Badge, ErrorBanner, Icon } from '../../../components';
import { useT } from '../../../i18n/i18n';
import { describeWarning } from './settingsLogic';
import type { ConfiguratorWarning } from '../../../api/settings';
import './settings.css';

export type SettingsScope = 'device' | 'project' | 'workspace';

export interface SectionShellProps {
  readonly sectionKey: string;
  readonly scope: SettingsScope;
  readonly children?: ComponentChildren;
}

export function SectionShell({ sectionKey, scope, children }: SectionShellProps): JSX.Element {
  const t = useT();
  return (
    <div class="gw-set-section">
      <header class="gw-set-header">
        <h2 class="gw-set-title">{t(`settings.section.${sectionKey}.title`)}</h2>
        <Badge label={t(`settings.scope.${scope}`)} tone="info" />
      </header>
      <p class="gw-set-desc">{t(`settings.section.${sectionKey}.desc`)}</p>
      {children}
    </div>
  );
}

export type SaveMode = 'instant' | 'form';

export interface SubSectionProps {
  // Omit the title when the section heading already names this block, so the same words are not shown twice.
  readonly title?: string;
  readonly scope?: SettingsScope;
  readonly saveMode?: SaveMode;
  readonly actions?: ComponentChildren;
  readonly children?: ComponentChildren;
}

function SaveModeHint({ mode }: { readonly mode: SaveMode }): JSX.Element {
  const t = useT();
  return (
    <span class="gw-set-save-hint" title={t(`vsc.settings.saveMode.${mode}.title`)}>
      <Icon name={mode === 'instant' ? 'zap' : 'save'} />
      {t(`vsc.settings.saveMode.${mode}`)}
    </span>
  );
}

export function SubSection({ title, scope, saveMode, actions, children }: SubSectionProps): JSX.Element {
  const t = useT();
  const hasHeader = title !== undefined || scope !== undefined || saveMode !== undefined || actions !== undefined;
  return (
    <section class="gw-set-sub">
      {hasHeader && (
        <header class="gw-set-sub-header">
          {title !== undefined && <h3 class="gw-set-sub-title">{title}</h3>}
          {scope !== undefined && <Badge label={t(`settings.scope.${scope}`)} tone="info" />}
          {saveMode !== undefined && <SaveModeHint mode={saveMode} />}
          {actions !== undefined && <div class="gw-set-sub-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export interface SettingRowProps {
  readonly label: string;
  readonly description?: string;
  readonly children?: ComponentChildren;
}

export function SettingRow({ label, description, children }: SettingRowProps): JSX.Element {
  return (
    <div class="gw-set-row">
      <div class="gw-set-row-text">
        <div class="gw-set-row-label">{label}</div>
        {description !== undefined && <div class="gw-set-row-desc">{description}</div>}
      </div>
      <div class="gw-set-row-control">{children}</div>
    </div>
  );
}

export function Field({ label, children }: { readonly label: string; readonly children?: ComponentChildren }): JSX.Element {
  return (
    <div class="gw-set-field">
      <span class="gw-set-field-label">{label}</span>
      {children}
    </div>
  );
}

export function WarningBanners({ warnings }: { readonly warnings: readonly ConfiguratorWarning[] | undefined }): JSX.Element | null {
  if (warnings === undefined || warnings.length === 0) {
    return null;
  }
  return (
    <div class="gw-set-warnings">
      {warnings.map((warning) => <ErrorBanner key={`${warning.target}:${warning.action}`} error={new Error(describeWarning(warning))} />)}
    </div>
  );
}

export function useDraft<T>(source: T): [T, (next: T) => void] {
  const [draft, setDraft] = useState<T>(source);
  useEffect(() => setDraft(source), [source]);
  return [draft, setDraft];
}

// Controls that save on change have no Cancel, so each save offers an Undo that writes the previous value back.
export function useUndoableSave<V>(save: (value: V) => Promise<unknown>, options: Omit<MutationOptions, 'successToast'>): { run: (next: V, previous: V) => Promise<boolean>; pending: boolean } {
  const t = useT();
  const mutation = useMutation(async (value: V) => {
    await save(value);
    return true;
  }, options);
  const run = async (next: V, previous: V): Promise<boolean> => {
    const isSaved = (await mutation.run(next)) === true;
    if (isSaved) {
      toasts.success(t('settings.saved'), { label: t('vsc.settings.undo'), run: () => void revert(previous) });
    }
    return isSaved;
  };
  const revert = async (previous: V): Promise<void> => {
    if ((await mutation.run(previous)) === true) {
      toasts.info(t('vsc.settings.reverted'));
    }
  };
  return { run, pending: mutation.pending };
}
