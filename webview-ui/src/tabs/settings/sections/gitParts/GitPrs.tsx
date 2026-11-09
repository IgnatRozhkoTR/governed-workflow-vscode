import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { addPr, deletePr, listPrs, listProjectRepos, type NewPr, type WorkspacePr } from '../../../../api/git';
import { Badge, Button, Card, IconButton, ResourceView, Select, TextField, useDialogs, useToast } from '../../../../components';
import { useT } from '../../../../i18n/i18n';
import { rpc } from '../../../../rpc/rpcClient';
import { useMutation, useResource, useWorkspaceState } from '../../../../store/hooks';
import { shortenUrl } from './gitLogic';

const WHOLE_PROJECT = '';

export function GitPrs({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const isMulti = useWorkspaceState().project_type === 'multi';
  const prs = useResource('git', 'prs', listPrs, { active });
  const repos = useResource('git', 'project-repos', listProjectRepos, { active: active && isMulti, refetchOnState: false });
  const repoOptions = [{ value: WHOLE_PROJECT, label: t('gitCockpit.prs.repoWholeProject') }, ...(repos.data?.repos ?? []).map((repo) => ({ value: String(repo.id), label: repo.name }))];
  return (
    <Card title={t('gitCockpit.prs.title')} badge={<Badge tone="neutral" label={String(prs.data?.prs.length ?? 0)} />}>
      <ResourceView resource={prs} empty={(data) => data.prs.length === 0} emptyMessage={t('gitCockpit.prs.empty')}>
        {(data) => (
          <div class="gw-git-list">
            {data.prs.map((pr) => <PrRow key={pr.id} pr={pr} />)}
          </div>
        )}
      </ResourceView>
      <AddPrForm repoOptions={isMulti && repoOptions.length > 1 ? repoOptions : undefined} />
    </Card>
  );
}

function PrRow({ pr }: { readonly pr: WorkspacePr }): JSX.Element {
  const t = useT();
  const toast = useToast();
  const dialogs = useDialogs();
  const remove = useMutation(deletePr, { invalidates: ['git'], successToast: t('messages.gcPrDeleted') });
  const open = (): void => {
    rpc.call('native.openExternal', { url: pr.url }).catch((error: unknown) => toast.error(error));
  };
  const confirmRemove = async (): Promise<void> => {
    const isConfirmed = await dialogs.confirm({ title: t('gitCockpit.prs.deleteTitle'), message: t('gitCockpit.prs.confirmDelete'), confirmLabel: t('buttons.remove'), danger: true });
    if (isConfirmed) {
      await remove.run(pr.id);
    }
  };
  return (
    <div class="gw-git-pr">
      <Badge tone="neutral" label={pr.name || pr.rel_path || t('gitCockpit.prs.repoWholeProject')} />
      <button type="button" class="gw-git-link" title={pr.url} onClick={open}>{pr.title || shortenUrl(pr.url)}</button>
      <IconButton icon="trash" title={t('gitCockpit.prs.deleteTitle')} tone="danger" disabled={remove.pending} onClick={confirmRemove} />
    </div>
  );
}

function AddPrForm({ repoOptions }: { readonly repoOptions: readonly { value: string; label: string }[] | undefined }): JSX.Element {
  const t = useT();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [repoId, setRepoId] = useState(WHOLE_PROJECT);
  const add = useMutation(addPr, { invalidates: ['git'], successToast: t('messages.gcPrAdded') });
  const submit = async (): Promise<void> => {
    if (url.trim() === '') {
      toast.error(new Error(t('messages.gcPrUrlRequired')));
      return;
    }
    const body: NewPr = {
      url: url.trim(),
      ...(title.trim() !== '' && { title: title.trim() }),
      ...(repoOptions !== undefined && repoId !== WHOLE_PROJECT && { repo_id: Number(repoId) }),
    };
    if ((await add.run(body)) !== undefined) {
      setUrl('');
      setTitle('');
      setRepoId(WHOLE_PROJECT);
    }
  };
  return (
    <div class="gw-git-inline">
      {repoOptions !== undefined && <Select value={repoId} options={repoOptions} onChange={setRepoId} />}
      <TextField value={url} onInput={setUrl} placeholder={t('gitCockpit.prs.urlPlaceholder')} onSubmit={submit} />
      <TextField value={title} onInput={setTitle} placeholder={t('gitCockpit.prs.titlePlaceholder')} onSubmit={submit} />
      <Button variant="primary" size="sm" icon="add" label={t('gitCockpit.prs.add')} busy={add.pending} onClick={submit} />
    </div>
  );
}
