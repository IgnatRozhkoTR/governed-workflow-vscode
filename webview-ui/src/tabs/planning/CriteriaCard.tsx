import type { Criterion } from '@api-types';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { addCriterion, deleteCriterion, listCriteria, validateCriterion } from '../../api/planning';
import {
  Badge, Button, Card, Commentable, Dialog, IconButton, KeyValueList, ResourceView, Select, StructuredValue, TextField, useDialogs,
} from '../../components';
import { useT } from '../../i18n/i18n';
import { useMutation, useResource } from '../../store/hooks';
import { buildDetailsJson, CRITERION_TYPES, criterionTypeKey, readCriterionDetails, type CriterionDraft } from './criteriaModel';

const EMPTY_DRAFT: CriterionDraft = { type: 'unit_test', description: '', file: '', names: '' };

export function CriteriaCard({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const criteria = useResource('criteria', 'list', () => listCriteria().then((response) => response.criteria), { active });
  const [isAdding, setAdding] = useState(false);
  const [detailsFor, setDetailsFor] = useState<Criterion | undefined>(undefined);
  return (
    <Card
      id="plan-criteria"
      title={t('cards.acceptanceCriteria')}
      collapsible
      defaultCollapsed
      persistKey="planning-criteria"
      badge={criteria.data === undefined ? undefined : <Badge label={String(criteria.data.length)} tone="neutral" />}
      actions={<Button size="sm" variant="secondary" icon="add" label={t('vsc.planning.addCriterion')} onClick={() => setAdding(true)} />}
    >
      <ResourceView resource={criteria} empty={(list) => list.length === 0} emptyMessage={t('criteria.noEntries')}>
        {(list) => (
          <>
            <p class="gw-muted gw-planning-hint">{t('criteria.acceptedOnPlanApproval')}</p>
            <ul class="gw-planning-criteria">
              {list.map((criterion) => <CriterionRow key={criterion.id} criterion={criterion} onShowDetails={setDetailsFor} />)}
            </ul>
          </>
        )}
      </ResourceView>
      <AddCriterionDialog open={isAdding} onClose={() => setAdding(false)} />
      <CriterionDetailsDialog criterion={detailsFor} onClose={() => setDetailsFor(undefined)} />
    </Card>
  );
}

function StatusBadge({ criterion }: { readonly criterion: Criterion }): JSX.Element | null {
  const t = useT();
  if (criterion.status === 'proposed') {
    return <Badge tone="warning" label={criterion.source === 'agent' ? t('badges.proposedByAgent') : t('badges.pendingReview')} />;
  }
  if (criterion.status === 'accepted') {
    return <Badge tone="success" label={t('badges.accepted')} />;
  }
  return criterion.status === 'rejected' ? <Badge tone="danger" label={t('badges.rejected')} /> : null;
}

function ValidationBadge({ criterion }: { readonly criterion: Criterion }): JSX.Element | null {
  const t = useT();
  const isCustom = criterion.type === 'custom';
  const title = criterion.validation_message ?? undefined;
  if (criterion.validated === 1) {
    return <Badge tone="success" label={t(isCustom ? 'badges.userApproved' : 'badges.passed')} title={title} icon="pass" />;
  }
  return criterion.validated === -1 ? <Badge tone="danger" label={t(isCustom ? 'badges.userRejected' : 'badges.failed')} title={title} icon="error" /> : null;
}

interface CriterionRowProps {
  readonly criterion: Criterion;
  readonly onShowDetails: (criterion: Criterion) => void;
}

function CriterionRow({ criterion, onShowDetails }: CriterionRowProps): JSX.Element {
  const t = useT();
  const dialogs = useDialogs();
  const validation = useMutation((passed: boolean) => validateCriterion(criterion.id, passed), { invalidates: ['criteria'], successToast: t('vsc.planning.criterionValidated') });
  const removal = useMutation(() => deleteCriterion(criterion.id), { invalidates: ['criteria'], successToast: t('vsc.planning.criterionDeleted') });
  const confirmDelete = async (): Promise<void> => {
    const isConfirmed = await dialogs.confirm({ title: t('vsc.planning.deleteCriterionTitle'), message: t('vsc.planning.deleteCriterionMessage'), confirmLabel: t('buttons.delete'), danger: true });
    if (isConfirmed) {
      await removal.run();
    }
  };
  const isCustom = criterion.type === 'custom';
  const hasDetails = readCriterionDetails(criterion) !== undefined;
  return (
    <li class="gw-planning-criterion">
      <Commentable scope="criteria" target={`criterion:${criterion.id}`}>
        <div class="gw-planning-criterion-main">
          <span class="gw-planning-criterion-type">{t(criterionTypeKey(criterion.type))}</span>
          <span class="gw-planning-criterion-description">{criterion.description}</span>
          {hasDetails && <button type="button" class="gw-link" title={t('criteria.viewDetails')} onClick={() => onShowDetails(criterion)}>{t('criteria.detailsLink')}</button>}
        </div>
        <div class="gw-planning-criterion-badges">
          <StatusBadge criterion={criterion} />
          <ValidationBadge criterion={criterion} />
          {isCustom && criterion.validated !== 1 && (
            <Button size="sm" variant="secondary" label={t(criterion.validated === -1 ? 'buttons.reapprove' : 'buttons.validate')} disabled={validation.pending} onClick={async () => { await validation.run(true); }} />
          )}
          <IconButton icon="trash" title={t('buttons.delete')} tone="danger" disabled={removal.pending} onClick={confirmDelete} />
        </div>
        {criterion.validation_message !== null && criterion.validation_message !== '' && <p class="gw-muted gw-planning-criterion-message">{criterion.validation_message}</p>}
      </Commentable>
    </li>
  );
}

function AddCriterionDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }): JSX.Element {
  const t = useT();
  const [draft, setDraft] = useState<CriterionDraft>(EMPTY_DRAFT);
  const creation = useMutation(async () => {
    await addCriterion({ type: draft.type, description: draft.description.trim(), details_json: buildDetailsJson(draft) });
    return true;
  }, { invalidates: ['criteria'], successToast: t('vsc.planning.criterionAdded') });
  const update = (patch: Partial<CriterionDraft>): void => setDraft({ ...draft, ...patch });
  const submit = async (): Promise<void> => {
    if (await creation.run()) {
      setDraft(EMPTY_DRAFT);
      onClose();
    }
  };
  const isCustom = draft.type === 'custom';
  return (
    <Dialog
      open={open}
      title={t('vsc.planning.addCriterion')}
      onClose={onClose}
      busy={creation.pending}
      footer={<><Button variant="secondary" label={t('vsc.common.cancel')} onClick={onClose} /><Button variant="primary" label={t('buttons.add')} disabled={draft.description.trim() === ''} busy={creation.pending} onClick={submit} /></>}
    >
      <div class="gw-planning-form">
        <label class="gw-planning-field">
          <span>{t('vsc.planning.criterionType')}</span>
          <Select value={draft.type} options={CRITERION_TYPES.map((type) => ({ value: type, label: t(criterionTypeKey(type)) }))} onChange={(type) => update({ type })} />
        </label>
        <label class="gw-planning-field">
          <span>{t('vsc.planning.criterionDescription')}</span>
          <TextField value={draft.description} onInput={(description) => update({ description })} placeholder={t('placeholders.description')} autoFocus multiline rows={3} />
        </label>
        {!isCustom && (
          <>
            <label class="gw-planning-field">
              <span>{t('labels.file')}</span>
              <TextField value={draft.file} onInput={(file) => update({ file })} placeholder={t('placeholders.filePath')} />
            </label>
            <label class="gw-planning-field">
              <span>{t(draft.type === 'bdd_scenario' ? 'labels.scenarios' : 'labels.testMethods')}</span>
              <TextField value={draft.names} onInput={(names) => update({ names })} placeholder={t('placeholders.testNames')} />
            </label>
          </>
        )}
      </div>
    </Dialog>
  );
}

function CriterionDetailsDialog({ criterion, onClose }: { readonly criterion: Criterion | undefined; readonly onClose: () => void }): JSX.Element {
  const t = useT();
  const details = criterion === undefined ? undefined : readCriterionDetails(criterion);
  const items = [];
  if (criterion !== undefined && details !== undefined) {
    if (details.file !== undefined) {
      items.push({ label: t('labels.file'), value: <code>{details.file}</code> });
    }
    if (details.names.length > 0) {
      items.push({ label: `${t(details.isScenario ? 'labels.scenarios' : 'labels.testMethods')} (${details.names.length})`, value: <StructuredValue value={details.names} /> });
    }
    if (details.instruction !== undefined) {
      items.push({ label: t('labels.instruction'), value: <StructuredValue value={details.instruction} /> });
    }
    if (criterion.validation_message !== null && criterion.validation_message !== '') {
      items.push({ label: t('labels.validationResult'), value: <StructuredValue value={criterion.validation_message} /> });
    }
  }
  return (
    <Dialog open={criterion !== undefined} title={criterion === undefined ? t('vsc.planning.criterionDetails') : `${t(criterionTypeKey(criterion.type))}: ${criterion.description}`} onClose={onClose} size="md">
      {items.length === 0 ? <p class="gw-muted">{t('criteria.noDetailsAvailable')}</p> : <KeyValueList items={items} />}
    </Dialog>
  );
}
