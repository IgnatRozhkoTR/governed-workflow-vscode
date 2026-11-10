import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { attachRepo, getProjectRepo, getRepoState, listProjectRepos, updateProjectRepo, type AttachedRepo, type ProjectRepo } from '../../../../api/git';
import { Badge, Button, Card, ResourceView, TextField, useToast } from '../../../../components';
import { useT } from '../../../../i18n/i18n';
import { useMutation, useResource, useWorkspaceState } from '../../../../store/hooks';
import { ConvertPanel } from './ConvertPanel';
import { baseSyncNotice, type ConvertMode } from './gitLogic';

export function GitRepos({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const isMulti = useWorkspaceState().project_type === 'multi';
  const [convertMode, setConvertMode] = useState<ConvertMode | undefined>(undefined);
  const repos = useResource('git', 'project-repos', listProjectRepos, { active: active && isMulti, refetchOnState: false });
  const repoState = useResource('git', 'repo-state', getRepoState, { active: active && isMulti });
  const attachedById = new Map<number, AttachedRepo>((repoState.data?.attached ?? []).map((attached) => [attached.repo_id, attached]));
  const openConvert = (mode: ConvertMode): void => setConvertMode(mode);
  const closeConvert = (): void => setConvertMode(undefined);
  const panel = convertMode !== undefined && <ConvertPanel mode={convertMode} registry={repos.data?.repos ?? []} onClose={closeConvert} />;

  if (!isMulti) {
    return (
      <Card id="git-repos-convert" title={t('gitCockpit.repos.title')} actions={<Button size="sm" variant="secondary" icon="repo-forked" label={t('gitCockpit.repos.convertBtn')} onClick={() => openConvert('convert')} />}>
        {panel}
      </Card>
    );
  }
  return (
    <Card id="git-repos-edit" title={t('gitCockpit.repos.title')} actions={<Button size="sm" variant="secondary" icon="edit" label={t('gitCockpit.repos.editSelectionBtn')} onClick={() => openConvert('edit')} />}>
      <ResourceView resource={repos} empty={(data) => data.repos.length === 0} emptyMessage={t('gitCockpit.repos.noRepos')}>
        {(data) => (
          <div class="gw-git-list">
            {data.repos.map((repo) => <RepoRow key={repo.id} repo={repo} attached={attachedById.get(repo.id)} />)}
          </div>
        )}
      </ResourceView>
      {panel}
    </Card>
  );
}

function RepoRow({ repo, attached }: { readonly repo: ProjectRepo; readonly attached: AttachedRepo | undefined }): JSX.Element {
  const t = useT();
  const toast = useToast();
  const [isOverrideOpen, setOverrideOpen] = useState(false);
  const attach = useMutation(attachRepo, { invalidates: ['git'], refreshState: true });
  const runAttach = async (): Promise<void> => {
    const result = await attach.run(repo.id);
    const notice = result === undefined ? undefined : baseSyncNotice(result.base_sync, repo.base_branch);
    if (notice?.kind === 'updated') {
      toast.info(t('messages.baseSyncUpdated', { branch: notice.branch }));
    } else if (notice !== undefined) {
      toast.info(t('messages.baseSyncNotUpdated', { branch: notice.branch, reason: notice.reason }));
    }
  };
  return (
    <div class="gw-git-repo">
      <div class="gw-git-repo-main">
        <div class="gw-git-repo-identity">
          <span class="gw-git-repo-name">{repo.name}</span>
          {repo.rel_path !== repo.name && <span class="gw-git-repo-path">{repo.rel_path}</span>}
        </div>
        <BaseBranchInput repo={repo} />
        {attached !== undefined ? (
          <Badge tone="success" label={`${t('gitCockpit.repos.attached')} · ${attached.branch ?? ''}`} />
        ) : (
          <>
            <Badge tone="neutral" label={t('gitCockpit.repos.notAttached')} />
            <Button size="sm" variant="secondary" icon="link" label={t('gitCockpit.repos.attachBtn')} busy={attach.pending} onClick={runAttach} />
          </>
        )}
        <Button size="sm" variant="ghost" icon={isOverrideOpen ? 'chevron-down' : 'chevron-right'} label={t('gitCockpit.repos.overrideBtn')} onClick={() => setOverrideOpen(!isOverrideOpen)} />
        {repo.has_rules_override === true && <span class="gw-git-override-dot" />}
      </div>
      {isOverrideOpen && <OverridePanel repoId={repo.id} />}
    </div>
  );
}

function BaseBranchInput({ repo }: { readonly repo: ProjectRepo }): JSX.Element {
  const t = useT();
  const original = repo.base_branch ?? '';
  const [value, setValue] = useState(original);
  useEffect(() => setValue(original), [original]);
  const save = useMutation(updateProjectRepo, { invalidates: ['git'], successToast: t('vsc.git.saved') });
  const commit = async (): Promise<void> => {
    const next = value.trim();
    if (next === original) {
      return;
    }
    if ((await save.run(repo.id, { base_branch: next })) === undefined) {
      setValue(original);
    }
  };
  return (
    <div class="gw-git-repo-base" onFocusOut={commit}>
      <TextField value={value} onInput={setValue} placeholder={t('gitCockpit.repos.baseBranchPlaceholder')} disabled={save.pending} onSubmit={commit} />
    </div>
  );
}

function OverridePanel({ repoId }: { readonly repoId: number }): JSX.Element {
  const t = useT();
  const full = useResource('git', `project-repo|${repoId}`, () => getProjectRepo(repoId), { refetchOnState: false });
  return <ResourceView resource={full}>{(data) => <OverrideEditor repoId={repoId} initial={data.git_rules_override ?? ''} label={t('gitCockpit.repos.overridePlaceholder')} />}</ResourceView>;
}

function OverrideEditor({ repoId, initial, label }: { readonly repoId: number; readonly initial: string; readonly label: string }): JSX.Element {
  const t = useT();
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);
  const save = useMutation(updateProjectRepo, { invalidates: ['git'], successToast: t('messages.gcOverrideSaved') });
  const clear = useMutation(updateProjectRepo, { invalidates: ['git'], successToast: t('messages.gcOverrideCleared') });
  return (
    <div class="gw-git-override">
      <TextField multiline rows={6} value={text} onInput={setText} placeholder={label} />
      <div class="gw-git-actions">
        <Button size="sm" variant="secondary" label={t('gitCockpit.repos.overrideClear')} busy={clear.pending} onClick={async () => {
          await clear.run(repoId, { git_rules_override: null });
          setText('');
        }} />
        <Button size="sm" variant="primary" label={t('gitCockpit.repos.overrideSave')} busy={save.pending} onClick={async () => { await save.run(repoId, { git_rules_override: text }); }} />
      </div>
    </div>
  );
}
