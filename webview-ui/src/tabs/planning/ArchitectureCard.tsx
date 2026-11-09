import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { Card, CommentIcon, EmptyState, MermaidDiagram } from '../../components';
import { useT } from '../../i18n/i18n';
import { normalizeSystemDiagrams, prepareDiagramSource } from './systemDiagram';
import { useThemeIsLight } from './useThemeIsLight';

export function ArchitectureCard({ systemDiagram }: { readonly systemDiagram: unknown }): JSX.Element {
  const t = useT();
  const isLight = useThemeIsLight();
  const { format, entries } = useMemo(() => normalizeSystemDiagrams(systemDiagram), [systemDiagram]);
  return (
    <Card
      id="plan-architecture"
      title={t('cards.systemArchitecture')}
      actions={<CommentIcon scope="architecture" target="System Diagram" />}
    >
      {format === 'invalid' && <EmptyState icon="warning" message={t('plan.invalidDiagramFormat')} />}
      {format === 'empty' && <EmptyState icon="type-hierarchy" message={t('plan.noSystemDiagram')} />}
      {format === 'ok' && entries.length === 0 && <EmptyState icon="type-hierarchy" message={t('vsc.planning.diagramEmpty')} />}
      {entries.map((entry, index) => (
        <div class="gw-planning-diagram" key={`${index}:${entry.title}`}>
          <MermaidDiagram title={entry.title === '' ? undefined : entry.title} source={prepareDiagramSource(entry.source, isLight)} />
        </div>
      ))}
    </Card>
  );
}
