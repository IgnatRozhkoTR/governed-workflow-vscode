import { describe, expect, it } from 'vitest';
import { approveLabelKind } from '../../webview-ui/src/shell/gateLabels';
import { phaseChipName } from '../../webview-ui/src/shell/layout';

describe('approveLabelKind', () => {
  it('approveLabelKind_shouldReturnBlocked_whenThreadsBlock', () => {
    expect(approveLabelKind({ phase: '4.2', serverLabel: 'Approve', blockingCount: 3 })).toBe('blocked');
  });

  it('approveLabelKind_shouldReturnShip_atFinalGateWhateverTheServerSays', () => {
    expect(approveLabelKind({ phase: '4.2', serverLabel: 'Одобрить', blockingCount: 0 })).toBe('ship');
  });

  it('approveLabelKind_shouldKeepServerLabel_whenItFits', () => {
    expect(approveLabelKind({ phase: '2.1', serverLabel: 'Approve Plan', blockingCount: 0 })).toBe('server');
  });

  it('approveLabelKind_shouldShorten_whenServerLabelIsTooLong', () => {
    expect(approveLabelKind({ phase: '1.4', serverLabel: 'Одобрить предпланирование', blockingCount: 0 })).toBe('short');
  });
});

describe('phaseChipName', () => {
  it('phaseChipName_shouldDropName_whenNarrow', () => {
    expect(phaseChipName('Inventory reservation', 'overflow')).toBeUndefined();
  });

  it('phaseChipName_shouldKeepName_whenWide', () => {
    expect(phaseChipName('Planning', 'compact')).toBe('Planning');
    expect(phaseChipName('Planning', 'full')).toBe('Planning');
  });
});

