import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Badge, ErrorBanner } from '../../../components';
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

export interface SubSectionProps {
  readonly title: string;
  readonly scope?: SettingsScope;
  readonly actions?: ComponentChildren;
  readonly children?: ComponentChildren;
}

export function SubSection({ title, scope, actions, children }: SubSectionProps): JSX.Element {
  const t = useT();
  return (
    <section class="gw-set-sub">
      <header class="gw-set-sub-header">
        <h3 class="gw-set-sub-title">{title}</h3>
        {scope !== undefined && <Badge label={t(`settings.scope.${scope}`)} tone="info" />}
        {actions !== undefined && <div class="gw-set-sub-actions">{actions}</div>}
      </header>
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
