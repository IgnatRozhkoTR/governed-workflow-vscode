import type { Plan } from '@api-types';
import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { Card, EmptyState, MermaidDiagram } from '../../components';
import { useT } from '../../i18n/i18n';
import { applyFlowTooltips, buildExecutionFlowWithTooltips, DARK_FLOW_PALETTE, LIGHT_FLOW_PALETTE } from './executionFlow';
import { useThemeIsLight } from './useThemeIsLight';

const FLOW_FIT_HEIGHT = 380;

export function ExecutionFlowCard({ plan }: { readonly plan: Plan }): JSX.Element {
  const t = useT();
  const isLight = useThemeIsLight();
  const flows = useMemo(() => {
    const palette = isLight ? LIGHT_FLOW_PALETTE : DARK_FLOW_PALETTE;
    return { compact: buildExecutionFlowWithTooltips(plan, 'LR', palette), full: buildExecutionFlowWithTooltips(plan, 'TD', palette) };
  }, [plan, isLight]);
  return (
    <Card id="plan-flow" title={t('cards.executionFlow')}>
      {flows.compact.source === '' ? (
        <EmptyState icon="git-merge" message={t('vsc.planning.noFlow')} />
      ) : (
        <MermaidDiagram
          source={flows.compact.source}
          fullscreenSource={flows.full.source}
          fitHeight={FLOW_FIT_HEIGHT}
          postProcess={(svg) => applyFlowTooltips(svg, flows.compact.tooltips)}
        />
      )}
    </Card>
  );
}
