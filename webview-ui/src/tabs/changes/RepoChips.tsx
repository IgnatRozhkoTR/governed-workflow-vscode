import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { classNames } from '../../components/types';
import { useT } from '../../i18n/i18n';
import type { RepoChip } from './diffModel';

export interface RepoChipsProps {
  readonly chips: readonly RepoChip[];
  readonly selected: string;
  readonly onSelect: (value: string) => void;
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

// A radio group: Tab enters on the selected chip, arrows move and select, as in a native radio set.
export function RepoChips({ chips, selected, onSelect }: RepoChipsProps): JSX.Element {
  const t = useT();
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, chips.findIndex((chip) => chip.value === selected));
  const moveTo = (index: number): void => {
    const wrapped = (index + chips.length) % chips.length;
    const target = chips[wrapped];
    if (target !== undefined) {
      onSelect(target.value);
      groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[wrapped]?.focus();
    }
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const index = keyTargetIndex(event.key, selectedIndex, chips.length);
    if (index !== undefined) {
      event.preventDefault();
      moveTo(index);
    }
  };
  return (
    <div ref={groupRef} class="gw-changes-repo-chips" role="radiogroup" aria-label={t('diff.repository')} onKeyDown={onKeyDown}>
      {chips.map((chip, index) => <RepoChipButton key={chip.value} chip={chip} isSelected={index === selectedIndex} onSelect={onSelect} />)}
    </div>
  );
}

function keyTargetIndex(key: string, current: number, count: number): number | undefined {
  if (NEXT_KEYS.has(key)) {
    return current + 1;
  }
  if (PREVIOUS_KEYS.has(key)) {
    return current - 1;
  }
  if (key === 'Home') {
    return 0;
  }
  return key === 'End' ? count - 1 : undefined;
}

interface RepoChipButtonProps {
  readonly chip: RepoChip;
  readonly isSelected: boolean;
  readonly onSelect: (value: string) => void;
}

function RepoChipButton({ chip, isSelected, onSelect }: RepoChipButtonProps): JSX.Element {
  const t = useT();
  const filesLabel = chip.fileCount === undefined ? undefined : t('vsc.changes.chipFiles', { count: chip.fileCount });
  const threadsLabel = t('vsc.changes.chipThreads', { count: chip.threadCount });
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      tabIndex={isSelected ? 0 : -1}
      class={classNames('gw-changes-repo-chip', isSelected && 'gw-changes-repo-chip-active')}
      title={[chip.name, filesLabel, threadsLabel].filter(Boolean).join(' · ')}
      onClick={() => onSelect(chip.value)}
    >
      <span class="gw-changes-repo-chip-name">{chip.name}</span>
      {filesLabel !== undefined && <span class="gw-changes-repo-chip-count">{filesLabel}</span>}
      {chip.threadCount > 0 && <span class="gw-changes-repo-chip-threads">{threadsLabel}</span>}
    </button>
  );
}
