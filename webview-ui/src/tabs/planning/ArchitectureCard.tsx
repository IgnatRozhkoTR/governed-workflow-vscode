import type { ComponentChildren, JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { Card, CommentIcon, EmptyState, MermaidDiagram } from '../../components';
import { classNames } from '../../components/types';
import { useAnchorTarget } from '../../components/useAnchor';
import { useT } from '../../i18n/i18n';
import { FAILED_DIAGRAM_ANCHOR } from '../../shell/gateDigestModel';
import { useResource } from '../../store/hooks';
import { failedDiagramIndexes } from './diagramCheck';
import { useWorkspaceCardKey } from './workspaceCardKey';
import { normalizeSystemDiagrams, prepareDiagramSource } from './systemDiagram';
import { useThemeIsLight } from './useThemeIsLight';

const NO_FAILURES: readonly number[] = [];

// The failed-diagram warning opens this card and lands on the first diagram that fails to render.
export function ArchitectureCard({ systemDiagram }: { readonly systemDiagram: unknown }): JSX.Element {
  const t = useT();
  const isLight = useThemeIsLight();
  const persistKey = useWorkspaceCardKey('plan-architecture');
  const { format, entries } = useMemo(() => normalizeSystemDiagrams(systemDiagram), [systemDiagram]);
  const failures = useResource('context', 'architecture.failedDiagrams', () => failedDiagramIndexes(systemDiagram));
  const firstFailed = (failures.data ?? NO_FAILURES)[0];
  return (
    <Card
      id="plan-architecture"
      title={t('cards.systemArchitecture')}
      defaultCollapsed
      persistKey={persistKey}
      key={persistKey}
      revealOnAnchor={FAILED_DIAGRAM_ANCHOR}
      actions={<CommentIcon scope="architecture" target="System Diagram" />}
    >
      {format === 'invalid' && (
        <AnchoredBlock anchorId={FAILED_DIAGRAM_ANCHOR}>
          <EmptyState icon="warning" message={t('plan.invalidDiagramFormat')} />
        </AnchoredBlock>
      )}
      {format === 'empty' && <EmptyState icon="type-hierarchy" message={t('plan.noSystemDiagram')} />}
      {format === 'ok' && entries.length === 0 && <EmptyState icon="type-hierarchy" message={t('vsc.planning.diagramEmpty')} />}
      {entries.map((entry, index) => (
        <AnchoredBlock key={`${index}:${entry.title}`} className="gw-planning-diagram" anchorId={index === firstFailed ? FAILED_DIAGRAM_ANCHOR : undefined}>
          <MermaidDiagram title={entry.title === '' ? undefined : entry.title} source={prepareDiagramSource(entry.source, isLight)} />
        </AnchoredBlock>
      ))}
    </Card>
  );
}

interface AnchoredBlockProps {
  readonly anchorId: string | undefined;
  readonly className?: string;
  readonly children: ComponentChildren;
}

function AnchoredBlock({ anchorId, className, children }: AnchoredBlockProps): JSX.Element {
  const [ref, isHighlighted] = useAnchorTarget<HTMLDivElement>(anchorId);
  return <div id={anchorId} ref={ref} class={classNames(className, isHighlighted && 'gw-card-highlight')}>{children}</div>;
}
