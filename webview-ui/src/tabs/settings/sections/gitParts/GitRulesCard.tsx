import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getGitRules, saveGitRules, type GitRules, type GitRulesSource } from '../../../../api/git';
import { Badge, Button, Card, ResourceView, TextField } from '../../../../components';
import { useT } from '../../../../i18n/i18n';
import { useMutation, useResource } from '../../../../store/hooks';

const SOURCE_KEYS: Readonly<Record<GitRulesSource, string>> = {
  'system-default': 'gitRules.sourceSystemDefault',
  project: 'gitRules.sourceProject',
  'not-configured': 'gitRules.sourceNotConfigured',
};

export function GitRulesCard({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const rules = useResource('git', 'git-rules', getGitRules, { active, refetchOnState: false });
  return (
    <Card title={t('cards.gitRules')} subtitle={t('gitCockpit.rules.shadowNote')}>
      <ResourceView resource={rules}>{(data) => <GitRulesForm initial={data} />}</ResourceView>
    </Card>
  );
}

function GitRulesForm({ initial }: { readonly initial: GitRules }): JSX.Element {
  const t = useT();
  const [content, setContent] = useState(initial.content);
  useEffect(() => setContent(initial.content), [initial.content]);
  const save = useMutation(saveGitRules, { invalidates: ['git'], successToast: t('messages.gitRulesSaved') });
  const sourceLabel = t(SOURCE_KEYS[initial.source] ?? initial.source);
  return (
    <div class="gw-git-form gw-git-rules" style={{ maxWidth: 'none' }}>
      <div class="gw-git-inline">
        <Badge tone={initial.source === 'project' ? 'success' : 'neutral'} label={t('gitRules.source', { label: sourceLabel })} />
      </div>
      <TextField multiline rows={14} value={content} onInput={setContent} placeholder={t('placeholders.gitRules')} />
      <div class="gw-git-actions">
        <Button variant="primary" icon="save" label={t('buttons.saveRules')} disabled={content === initial.content} busy={save.pending} onClick={async () => { await save.run(content); }} />
      </div>
    </div>
  );
}
