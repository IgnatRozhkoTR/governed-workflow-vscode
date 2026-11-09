import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getGitConfig, saveGitConfig, type GitConfig, type GitProvider } from '../../../../api/git';
import { Button, Card, ResourceView, Select, TextField } from '../../../../components';
import { useT } from '../../../../i18n/i18n';
import { useMutation, useResource, useWorkspaceState } from '../../../../store/hooks';

const DEFAULT_BRANCH = 'develop';

export function GitConfigCard({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const config = useResource('git', 'git-config', getGitConfig, { active, refetchOnState: false });
  return (
    <Card title={t('cards.gitConfiguration')}>
      <ResourceView resource={config}>{(data) => <GitConfigForm initial={data} />}</ResourceView>
    </Card>
  );
}

function GitConfigForm({ initial }: { readonly initial: GitConfig }): JSX.Element {
  const t = useT();
  const isMulti = useWorkspaceState().project_type === 'multi';
  const [draft, setDraft] = useState<GitConfig>(initial);
  useEffect(() => setDraft(initial), [initial]);
  const save = useMutation(saveGitConfig, { invalidates: ['git'], successToast: t('messages.gitConfigSaved') });
  const patch = (change: Partial<GitConfig>): void => setDraft({ ...draft, ...change });
  const submit = async (): Promise<void> => {
    await save.run({ ...draft, default_branch: draft.default_branch.trim() || DEFAULT_BRANCH });
  };
  return (
    <div class="gw-git-form">
      <div class="gw-git-field">
        <label class="gw-field-label">{t('labels.provider')}</label>
        <Select
          value={draft.provider}
          options={[
            { value: 'local', label: t('gitProvider.local') },
            { value: 'github', label: t('gitProvider.github') },
            { value: 'gitlab', label: t('gitProvider.gitlab') },
          ]}
          onChange={(value) => patch({ provider: value as GitProvider })}
        />
      </div>
      {draft.provider === 'gitlab' && (
        <>
          <div class="gw-git-field">
            <label class="gw-field-label">{t('labels.host')}</label>
            <TextField value={draft.host} onInput={(host) => patch({ host })} placeholder={t('placeholders.gitHost')} />
          </div>
          <div class="gw-git-field">
            <label class="gw-field-label">{t('labels.apiToken')}</label>
            <input
              class="gw-input"
              type="password"
              autoComplete="off"
              value={draft.token}
              placeholder={t('placeholders.enterToken')}
              onInput={(event) => patch({ token: event.currentTarget.value })}
            />
          </div>
        </>
      )}
      {!isMulti && (
        <div class="gw-git-field">
          <label class="gw-field-label">{t('labels.defaultBranch')}</label>
          <TextField value={draft.default_branch} onInput={(defaultBranch) => patch({ default_branch: defaultBranch })} placeholder={t('placeholders.develop')} />
        </div>
      )}
      <div class="gw-git-actions">
        <Button variant="primary" icon="save" label={t('buttons.saveGitConfig')} busy={save.pending} onClick={submit} />
      </div>
    </div>
  );
}
