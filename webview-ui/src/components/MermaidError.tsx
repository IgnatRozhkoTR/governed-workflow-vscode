import type { JSX } from 'preact';
import { useT } from '../i18n/i18n';
import { describeError } from '../lib/format';
import { CodeBlock } from './CodeBlock';
import { Collapsible } from './Collapsible';
import { Icon } from './Icon';

export interface MermaidErrorProps {
  readonly error: unknown;
  readonly source?: string;
  readonly title?: string;
}

const TRAILING_COLON_PATTERN = /:$/;

function firstLine(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.trim() !== '') ?? text;
  return line.trim().replace(TRAILING_COLON_PATTERN, '');
}

export function MermaidError({ error, source, title }: MermaidErrorProps): JSX.Element {
  const t = useT();
  const details = describeError(error);
  const heading = title === undefined || title === '' ? t('vsc.mermaid.renderFailed') : t('vsc.mermaid.renderFailedTitled', { title });
  return (
    <div class="gw-mermaid gw-mermaid-error" role="group" aria-label={heading}>
      <div class="gw-mermaid-error-heading">
        <Icon name="warning" />
        <strong>{heading}</strong>
      </div>
      <div class="gw-mermaid-error-summary">{firstLine(details)}</div>
      <Collapsible summary={t('vsc.mermaid.details')}>
        <pre class="gw-mermaid-error-details">{details}</pre>
        {source !== undefined && source !== '' && <CodeBlock code={source} />}
      </Collapsible>
    </div>
  );
}
