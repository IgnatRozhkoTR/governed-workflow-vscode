import type { JSX } from 'preact';
import { Badge, Card, KeyValueList } from '../../../../components';
import { useT } from '../../../../i18n/i18n';
import { useWorkspaceState } from '../../../../store/hooks';

export function GitOverview(): JSX.Element {
  const t = useT();
  const state = useWorkspaceState();
  const isMulti = state.project_type === 'multi';
  const branch = state.source_branch ? `${state.branch} → ${state.source_branch}` : state.branch;
  return (
    <Card id="git-overview" title={t('gitCockpit.overview.title')}>
      <KeyValueList
        items={[
          {
            label: t('gitCockpit.overview.projectType'),
            value: <Badge tone={isMulti ? 'accent' : 'info'} label={isMulti ? t('gitCockpit.overview.typeMulti') : t('gitCockpit.overview.typeSingle')} />,
          },
          { label: t('gitCockpit.overview.workspaceBranch'), value: branch },
          { label: t('gitCockpit.overview.workingDir'), value: <span class="gw-git-mono">{state.working_dir || '—'}</span> },
        ]}
      />
    </Card>
  );
}
