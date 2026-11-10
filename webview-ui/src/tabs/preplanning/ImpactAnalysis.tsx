import type { JSX } from 'preact';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Markdown } from '../../components/Markdown';
import { StructuredValue } from '../../components/StructuredValue';
import { classNames } from '../../components/types';
import { useAnchorTarget } from '../../components/useAnchor';
import { useT } from '../../i18n/i18n';
import { impactPreview, impactSections, type ImpactSection } from './impact';
import { InlineDiscussion } from './InlineDiscussion';

const IMPACT_ANCHOR = 'preplanning-impact';

function ImpactSectionCard({ section }: { readonly section: ImpactSection }): JSX.Element {
  const t = useT();
  return (
    <InlineDiscussion
      scope="impact"
      target={section.key}
      renderItem={(trigger) => (
        <Card id={`impact-${section.key}`} title={t(section.labelKey)} actions={trigger} persistKey={`pp.impact.v2.${section.key}`} collapsedPreview={impactPreview(section.value)} revealOnAnchor={IMPACT_ANCHOR} defaultCollapsed>
          {typeof section.value === 'string' ? <Markdown source={section.value} /> : <StructuredValue value={section.value} />}
        </Card>
      )}
    />
  );
}

export function ImpactAnalysis({ analysis }: { readonly analysis: unknown }): JSX.Element {
  const t = useT();
  const sections = impactSections(analysis);
  const [ref, isHighlighted] = useAnchorTarget<HTMLElement>(IMPACT_ANCHOR);
  return (
    <section id={IMPACT_ANCHOR} ref={ref} class={classNames('gw-pp-group gw-anchor-target', isHighlighted && 'gw-card-highlight')}>
      <h2 class="gw-pp-heading">{t('preplanning.impactAnalysis')}</h2>
      {sections.length === 0 ? (
        <EmptyState icon="info" message={t('preplanning.noImpactAnalysis')} />
      ) : (
        sections.map((section) => <ImpactSectionCard key={section.key} section={section} />)
      )}
    </section>
  );
}
