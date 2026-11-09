import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { convertMulti, scanRepos, type ProjectRepo } from '../../../../api/git';
import { Button, ErrorBanner, Spinner, useToast } from '../../../../components';
import { useT } from '../../../../i18n/i18n';
import { useMutation } from '../../../../store/hooks';
import { buildConvertRows, selectionFrom, type ConvertMode, type ConvertRow } from './gitLogic';

export interface ConvertPanelProps {
  readonly mode: ConvertMode;
  readonly registry: readonly ProjectRepo[];
  readonly onClose: () => void;
}

export function ConvertPanel({ mode, registry, onClose }: ConvertPanelProps): JSX.Element {
  const t = useT();
  const toast = useToast();
  const [rows, setRows] = useState<readonly ConvertRow[] | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const convert = useMutation(convertMulti, { invalidates: ['git'], refreshState: true });

  useEffect(() => {
    scanRepos().then(
      (result) => {
        if (mode === 'convert' && result.candidates.length < 2) {
          toast.error(new Error(t('messages.gcNoSubReposFound')));
          onClose();
          return;
        }
        setRows(buildConvertRows(result.candidates, registry, mode));
      },
      (scanError: unknown) => setError(scanError),
    );
  }, []);

  if (error !== undefined) {
    return <ErrorBanner error={error} onRetry={onClose} />;
  }
  if (rows === undefined) {
    return <Spinner label={t('research.loading')} />;
  }
  const patchRow = (index: number, change: Partial<ConvertRow>): void =>
    setRows(rows.map((row, position) => (position === index ? { ...row, ...change } : row)));
  const submit = async (): Promise<void> => {
    const selection = selectionFrom(rows);
    if (selection.length === 0) {
      toast.error(new Error(t('messages.gcSelectAtLeastOne')));
      return;
    }
    const result = await convert.run(selection);
    if (result !== undefined) {
      toast.success(t('messages.gcConvertSuccess', { count: result.repos.length }));
      onClose();
    }
  };
  return (
    <div class="gw-git-convert">
      <strong>{t('gitCockpit.repos.checklistTitle')}</strong>
      <span class="gw-git-desc">{t('vsc.git.selectionHint')}</span>
      {rows.map((row, index) => (
        <div class="gw-git-convert-row" key={row.relPath}>
          <label class="gw-git-convert-check">
            <input type="checkbox" checked={row.checked} onChange={(event) => patchRow(index, { checked: event.currentTarget.checked })} />
            <span>{row.name}</span>
            {row.relPath !== row.name && <span class="gw-git-repo-path">{row.relPath}</span>}
          </label>
          <input
            class="gw-input gw-git-convert-base"
            type="text"
            value={row.baseBranch}
            placeholder={t('gitCockpit.repos.baseBranchPlaceholder')}
            onInput={(event) => patchRow(index, { baseBranch: event.currentTarget.value })}
          />
        </div>
      ))}
      <div class="gw-git-actions">
        <Button variant="secondary" label={t('gitCockpit.repos.cancelConvert')} disabled={convert.pending} onClick={onClose} />
        <Button variant="primary" label={t('gitCockpit.repos.confirmConvert')} busy={convert.pending} onClick={submit} />
      </div>
    </div>
  );
}
