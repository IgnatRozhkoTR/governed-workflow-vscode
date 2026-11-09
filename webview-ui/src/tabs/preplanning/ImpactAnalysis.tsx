import type { JSX } from 'preact';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Markdown } from '../../components/Markdown';
import { StructuredValue } from '../../components/StructuredValue';
import { useT } from '../../i18n/i18n';
import { impactSections, type ImpactSection } from './impact';
import { InlineDiscussion } from './InlineDiscussion';

function ImpactSectionCard({ section }: { readonly section: ImpactSection }): JSX.Element {
  const t = useT();
  return (
    <Card id={`impact-${section.key}`} title={t(section.labelKey)} collapsible persistKey={`pp.impact.${section.key}`}>
      <InlineDiscussion scope="impact" target={section.key}>
        {typeof section.value === 'string' ? <Markdown source={section.value} /> : <StructuredValue value={section.value} />}
      </InlineDiscussion>
    </Card>
  );
}

export function ImpactAnalysis({ analysis }: { readonly analysis: unknown }): JSX.Element {
  const t = useT();
  const sections = impactSections(analysis);
  return (
    <section class="gw-pp-group">
      <h2 class="gw-pp-heading">{t('preplanning.impactAnalysis')}</h2>
      {sections.length === 0 ? (
        <EmptyState icon="info" message={t('preplanning.noImpactAnalysis')} />
      ) : (
        sections.map((section) => <ImpactSectionCard key={section.key} section={section} />)
      )}
    </section>
  );
}
