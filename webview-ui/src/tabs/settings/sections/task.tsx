import type { WorkspaceContext } from '@api-types';
import type { JSX } from 'preact';
import { getContext } from '../../../api/preplanning';
import { putContext, searchPaths } from '../../../api/settings';
import { Button, ChipInput, CodeRef, Collapsible, ResourceView, TextField, Toolbar, useDialogs, useToast } from '../../../components';
import { useT } from '../../../i18n/i18n';
import { rpc } from '../../../rpc/rpcClient';
import { useMutation, useResource, useWorkspaceState } from '../../../store/hooks';
import type { SettingsSectionModule } from '../../types';
import { Field, SectionShell, SubSection, useDraft } from './parts';
import { SETTINGS_MESSAGES } from './settingsMessages';

const CONTEXT_ROWS = 8;
const TOPICS_AFTER_SAVE = ['context'] as const;

function ClaudeActions(): JSX.Element {
  const t = useT();
  const dialogs = useDialogs();
  const toast = useToast();
  const workingDir = useWorkspaceState().working_dir;
  const attempt = async (action: () => Promise<unknown>, successMessage?: string): Promise<void> => {
    try {
      await action();
      if (successMessage !== undefined) {
        toast.success(successMessage);
      }
    } catch (error) {
      toast.error(error);
    }
  };
  const start = async (): Promise<void> => {
    const isConfirmed = await dialogs.confirm({
      title: t('vsc.settings.startConfirmTitle'),
      message: t('vsc.settings.startConfirmMessage'),
      confirmLabel: t('buttons.start'),
      danger: true,
    });
    if (isConfirmed) {
      await attempt(() => rpc.call('native.startClaude', { confirmed: true }));
    }
  };
  return (
    <Toolbar align="start">
      <Button variant="primary" icon="play" label={t('vsc.settings.startClaude')} onClick={start} />
      <Button icon="debug-continue" label={t('vsc.settings.resumeClaude')} onClick={() => attempt(() => rpc.call('native.resumeClaude', {}))} />
      <Button icon="folder-opened" label={t('vsc.settings.openWorktree')} onClick={() => attempt(() => rpc.call('native.openWorktree', {}))} />
      <Button
        icon="copy"
        label={t('vsc.settings.copyCd')}
        title={workingDir}
        disabled={workingDir === ''}
        onClick={() => attempt(() => rpc.call('native.copyText', { text: `cd ${workingDir}` }), t('vsc.settings.copiedCd'))}
      />
    </Toolbar>
  );
}

function ContextForm({ data }: { readonly data: WorkspaceContext }): JSX.Element {
  const t = useT();
  const [draft, setDraft] = useDraft(data);
  const save = useMutation(putContext, { invalidates: TOPICS_AFTER_SAVE, successToast: t('messages.contextSaved') });
  const refs = draft.refs;
  const submit = async (): Promise<void> => {
    await save.run({ ticket_name: draft.ticket_name, context: draft.context, refs: [...refs] });
  };
  const openableRefs = refs.filter((ref) => !ref.endsWith('/'));
  return (
    <div class="gw-set-form">
      <div class="gw-set-grid">
        <Field label={t('labels.ticketId')}>
          <TextField value={draft.ticket_id} onInput={() => undefined} disabled />
        </Field>
        <Field label={t('labels.ticketName')}>
          <TextField value={draft.ticket_name} onInput={(value) => setDraft({ ...draft, ticket_name: value })} placeholder={t('placeholders.enterTicketName')} />
        </Field>
      </div>
      <Field label={t('labels.context')}>
        <TextField multiline rows={CONTEXT_ROWS} value={draft.context} onInput={(value) => setDraft({ ...draft, context: value })} placeholder={t('placeholders.describeTask')} />
      </Field>
      <Field label={t('labels.fileDirectoryReferences')}>
        <ChipInput
          values={refs}
          suggest={searchPaths}
          placeholder={t('placeholders.searchFilesAndDirs')}
          onAdd={(value) => setDraft({ ...draft, refs: [...refs, value] })}
          onRemove={(value) => setDraft({ ...draft, refs: refs.filter((ref) => ref !== value) })}
        />
        {openableRefs.length > 0 && (
          <div class="gw-set-refs">{openableRefs.map((ref) => <CodeRef key={ref} path={ref} />)}</div>
        )}
      </Field>
      <Toolbar align="end">
        <Button variant="primary" icon="save" label={t('buttons.saveContext')} busy={save.pending} onClick={submit} />
      </Toolbar>
    </div>
  );
}

function RawContext({ data }: { readonly data: WorkspaceContext }): JSX.Element {
  const t = useT();
  const hasContent = data.context !== '' || data.ticket_name !== '' || data.refs.length > 0;
  const raw = JSON.stringify({ ticket_id: data.ticket_id, ticket_name: data.ticket_name, context: data.context, refs: data.refs }, null, 2);
  return (
    <Collapsible summary={t('cards.savedContextRaw')} persistKey="settings.task.raw">
      <pre class="gw-set-raw">{hasContent ? raw : t('vsc.settings.contextRawEmpty')}</pre>
    </Collapsible>
  );
}

function TaskSection({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const context = useResource('context', 'task', getContext, { active, refetchOnState: false });
  return (
    <SectionShell sectionKey="task" scope="workspace">
      <SubSection title={t('labels.claude')}>
        <ClaudeActions />
      </SubSection>
      <SubSection title={t('cards.taskContext')}>
        <ResourceView resource={context}>
          {(data) => (
            <>
              <ContextForm data={data} />
              <RawContext data={data} />
            </>
          )}
        </ResourceView>
      </SubSection>
    </SectionShell>
  );
}

export const taskSection: SettingsSectionModule = {
  id: 'task',
  titleKey: 'settings.nav.task',
  order: 10,
  messages: SETTINGS_MESSAGES,
  Component: TaskSection,
};
