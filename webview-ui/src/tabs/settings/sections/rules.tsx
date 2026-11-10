import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { createRule, deleteRule, getRule, listRules, updateRule, type Rule, type RuleSummary } from '../../../api/settings';
import { Badge, Button, ChipInput, Dialog, ResourceView, TextField, Toolbar, useDialogs, useToast } from '../../../components';
import { useT } from '../../../i18n/i18n';
import { useMutation, useResource } from '../../../store/hooks';
import type { SettingsSectionModule } from '../../types';
import { Field, SectionShell, useDraft } from './parts';
import { validateRuleDraft } from './settingsLogic';
import { SETTINGS_MESSAGES } from './settingsMessages';

const RULES_TOPICS = ['rules'] as const;
const FIELD_ERROR_KEYS: readonly string[] = ['rules.description', 'rules.body'];
const BODY_ROWS = 14;
const NEW_RULE: Rule = { name: '', description: '', paths: [], body: '' };

type EditorTarget = { readonly kind: 'new' } | { readonly kind: 'edit'; readonly name: string };

function saveRule(draft: Rule, isNew: boolean): Promise<Rule> {
  return isNew ? createRule(draft) : updateRule(draft.name, { description: draft.description, paths: draft.paths, body: draft.body });
}

function RuleForm({ initial, isNew, onClose }: { readonly initial: Rule; readonly isNew: boolean; readonly onClose: () => void }): JSX.Element {
  const t = useT();
  const toast = useToast();
  const [draft, setDraft] = useDraft(initial);
  const save = useMutation(saveRule, { invalidates: RULES_TOPICS, successToast: t('messages.ruleSaved') });
  const submit = async (): Promise<void> => {
    const normalized = { ...draft, name: draft.name.trim(), description: draft.description.trim() };
    const problemKey = validateRuleDraft(normalized, isNew);
    if (problemKey !== undefined) {
      const message = FIELD_ERROR_KEYS.includes(problemKey) ? t('vsc.settings.ruleFieldRequired', { field: t(problemKey) }) : t(problemKey);
      toast.error(new Error(message));
      return;
    }
    if ((await save.run(normalized, isNew)) !== undefined) {
      onClose();
    }
  };
  return (
    <Dialog
      open
      size="lg"
      busy={save.pending}
      title={isNew ? t('rules.createTitle') : t('rules.editTitle', { name: initial.name })}
      onClose={onClose}
      footer={(
        <>
          <Button label={t('buttons.close')} disabled={save.pending} onClick={onClose} />
          <Button variant="primary" icon="save" label={t('buttons.saveRule')} busy={save.pending} onClick={submit} />
        </>
      )}
    >
      <div class="gw-set-form">
        <Field label={t('rules.name')}>
          <TextField value={draft.name} ariaLabel={t('rules.name')} disabled={!isNew} placeholder={t('placeholders.ruleName')} autoFocus={isNew} onInput={(name) => setDraft({ ...draft, name })} />
        </Field>
        <Field label={t('rules.description')}>
          <TextField value={draft.description} ariaLabel={t('rules.description')} autoFocus={!isNew} onInput={(description) => setDraft({ ...draft, description })} />
        </Field>
        <Field label={t('vsc.settings.rulePathsChips')}>
          <ChipInput
            values={draft.paths}
            minChars={1}
            placeholder={t('vsc.settings.rulePathsHint')}
            onAdd={(path) => setDraft({ ...draft, paths: [...draft.paths, path] })}
            onRemove={(path) => setDraft({ ...draft, paths: draft.paths.filter((existing) => existing !== path) })}
          />
        </Field>
        <Field label={t('rules.body')}>
          <div class="gw-set-mono">
            <TextField multiline rows={BODY_ROWS} value={draft.body} ariaLabel={t('rules.body')} placeholder={t('placeholders.ruleBody')} onInput={(body) => setDraft({ ...draft, body })} />
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

function RuleEditor({ target, onClose }: { readonly target: EditorTarget; readonly onClose: () => void }): JSX.Element | null {
  const name = target.kind === 'edit' ? target.name : '';
  const rule = useResource('rules', `rule:${name}`, () => getRule(name), { active: target.kind === 'edit', refetchOnState: false });
  const t = useT();
  if (target.kind === 'new') {
    return <RuleForm initial={NEW_RULE} isNew onClose={onClose} />;
  }
  if (rule.data === undefined) {
    return (
      <Dialog open title={t('rules.editTitle', { name })} onClose={onClose}>
        <ResourceView resource={rule}>{() => null}</ResourceView>
      </Dialog>
    );
  }
  return <RuleForm initial={rule.data} isNew={false} onClose={onClose} />;
}

function RuleCard({ rule, onEdit }: { readonly rule: RuleSummary; readonly onEdit: () => void }): JSX.Element {
  const t = useT();
  const dialogs = useDialogs();
  const remove = useMutation(deleteRule, { invalidates: RULES_TOPICS, successToast: t('messages.ruleDeleted') });
  const isDefault = rule.source === 'default';
  const confirmDelete = async (): Promise<void> => {
    const isConfirmed = await dialogs.confirm({ title: t('buttons.delete'), message: t('rules.confirmDelete', { name: rule.name }), danger: true });
    if (isConfirmed) {
      await remove.run(rule.name);
    }
  };
  return (
    <div class="gw-set-rule">
      <div class="gw-set-rule-head">
        <span class="gw-set-rule-name">{rule.name}</span>
        <Badge label={isDefault ? t('rules.sourceDefault') : t('rules.sourceUser')} tone={isDefault ? 'neutral' : 'accent'} />
        <div class="gw-set-rule-actions">
          <Button size="sm" icon="edit" label={t('buttons.edit')} disabled={isDefault} title={isDefault ? t('vsc.settings.ruleReadOnly') : undefined} onClick={onEdit} />
          {!isDefault && <Button size="sm" variant="danger" icon="trash" title={t('buttons.delete')} busy={remove.pending} onClick={confirmDelete} />}
        </div>
      </div>
      {rule.description !== '' && <div class="gw-set-row-desc">{rule.description}</div>}
      {rule.paths.length > 0 && <div class="gw-set-chips">{rule.paths.map((path) => <code key={path} class="gw-set-chip">{path}</code>)}</div>}
      {rule.error !== undefined && <div class="gw-set-error">{rule.error}</div>}
    </div>
  );
}

function RulesSection({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const rules = useResource('rules', 'list', listRules, { active, refetchOnState: false });
  const [target, setTarget] = useState<EditorTarget | undefined>(undefined);
  return (
    <SectionShell sectionKey="rules" scope="project">
      <Toolbar align="end">
        <Button variant="primary" icon="add" label={t('buttons.newRule')} onClick={() => setTarget({ kind: 'new' })} />
      </Toolbar>
      <ResourceView resource={rules} empty={(data) => data.length === 0} emptyMessage={t('vsc.settings.noRules')}>
        {(data) => (
          <div class="gw-set-rules">
            {data.map((rule) => <RuleCard key={rule.name} rule={rule} onEdit={() => setTarget({ kind: 'edit', name: rule.name })} />)}
          </div>
        )}
      </ResourceView>
      {target !== undefined && <RuleEditor target={target} onClose={() => setTarget(undefined)} />}
    </SectionShell>
  );
}

export const rulesSection: SettingsSectionModule = {
  id: 'rules',
  titleKey: 'settings.nav.rules',
  order: 60,
  messages: SETTINGS_MESSAGES,
  Component: RulesSection,
};
