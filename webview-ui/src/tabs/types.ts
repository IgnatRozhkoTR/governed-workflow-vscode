import type { NavTarget, SettingsSectionId, TabId } from '@shared/navigation';
import type { JSX } from 'preact';
import type { Codicon, Tone } from '../components/types';
import type { ModuleMessages } from '../i18n/i18n';

export type { ModuleMessages };

export interface TabProps {
  readonly active: boolean;
  readonly nav: NavTarget;
}

export interface TabModule {
  readonly id: TabId;
  readonly titleKey: string;
  readonly icon: Codicon;
  readonly messages?: ModuleMessages;
  readonly useBadge?: () => { count: number; tone: Tone } | undefined;
  readonly Component: (props: TabProps) => JSX.Element;
}

export interface SettingsSectionModule {
  readonly id: SettingsSectionId;
  readonly titleKey: string;
  readonly order: number;
  readonly messages?: ModuleMessages;
  readonly Component: (props: { readonly active: boolean }) => JSX.Element;
}
