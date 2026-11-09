import type { JSX } from 'preact';
import { useT } from '../../../i18n/i18n';
import type { SettingsSectionModule } from '../../types';
import { GitConfigCard } from './gitParts/GitConfigCard';
import { GitOverview } from './gitParts/GitOverview';
import { GitPrs } from './gitParts/GitPrs';
import { GitRepos } from './gitParts/GitRepos';
import { GitRulesCard } from './gitParts/GitRulesCard';
import { GIT_MESSAGES } from './gitParts/messages';
import './gitParts/git.css';

function GitSection({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  return (
    <div class="gw-git">
      <header>
        <h2 class="gw-git-title">{t('settings.section.git.title')}</h2>
        <p class="gw-git-desc">{t('settings.section.git.desc')}</p>
      </header>
      <GitOverview />
      <GitPrs active={active} />
      <GitRepos active={active} />
      <GitConfigCard active={active} />
      <GitRulesCard active={active} />
    </div>
  );
}

export const gitSection: SettingsSectionModule = {
  id: 'git',
  titleKey: 'settings.nav.git',
  order: 70,
  messages: GIT_MESSAGES,
  Component: GitSection,
};
