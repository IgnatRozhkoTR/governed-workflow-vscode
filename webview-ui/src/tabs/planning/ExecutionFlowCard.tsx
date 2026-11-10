import type { Plan } from '@api-types';
import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { Card, EmptyState, MermaidDiagram } from '../../components';
import { useT } from '../../i18n/i18n';
import { applyFlowTooltips, buildExecutionFlowWithTooltips, DARK_FLOW_PALETTE, LIGHT_FLOW_PALETTE } from './executionFlow';
import { useThemeIsLight } from './useThemeIsLight';
import { useWorkspaceCardKey } from './workspaceCardKey';

// Sub-phases stack top-down and only a sub-phase's own tasks run across, so the graph stays narrow enough to render
// at a readable size; it is not height-capped, because fitting a tall graph into a fixed height is what shrank its text.
export function ExecutionFlowCard({ plan }: { readonly plan: Plan }): JSX.Element {
  const t = useT();
  const isLight = useThemeIsLight();
  const persistKey = useWorkspaceCardKey('plan-flow');
  const flow = useMemo(() => buildExecutionFlowWithTooltips(plan, 'TD', isLight ? LIGHT_FLOW_PALETTE : DARK_FLOW_PALETTE), [plan, isLight]);
  return (
    <Card id="plan-flow" title={t('vsc.planning.taskFlowTitle')} defaultCollapsed persistKey={persistKey} key={persistKey}>
      {flow.source === '' ? (
        <EmptyState icon="git-merge" message={t('vsc.planning.noFlow')} />
      ) : (
        <MermaidDiagram source={flow.source} postProcess={(svg) => applyFlowTooltips(svg, flow.tooltips)} />
      )}
    </Card>
  );
}
