import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { getFileSnippet } from '../api/core';
import { useT } from '../i18n/i18n';
import { guessLanguage } from '../lib/markdown';
import { rpc } from '../rpc/rpcClient';
import { CodeBlock } from './CodeBlock';
import { Icon } from './Icon';
import { ResourceView } from './ResourceView';
import { toasts } from './ToastHost';
import { useResource } from '../store/hooks';

export interface CodeRefProps {
  readonly path: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly repo?: string;
  readonly absolute?: boolean;
  readonly label?: string;
  readonly quote?: boolean;
}

const QUOTE_MAX_HEIGHT = 320;

function refLabel({ path, lineStart, lineEnd, label }: CodeRefProps): string {
  if (label !== undefined) {
    return label;
  }
  if (lineStart === undefined) {
    return path;
  }
  return lineEnd === undefined || lineEnd === lineStart ? `${path}:${lineStart}` : `${path}:${lineStart}-${lineEnd}`;
}

export function CodeRef(props: CodeRefProps): JSX.Element {
  const t = useT();
  const [isQuoteOpen, setQuoteOpen] = useState(false);
  const open = (): void => {
    rpc.call('native.openFile', { path: props.path, line: props.lineStart, endLine: props.lineEnd, repo: props.repo, absolute: props.absolute })
      .catch(toasts.error);
  };
  return (
    <span class="gw-code-ref">
      <button type="button" class="gw-link" title={props.path} onClick={open}>
        <Icon name="file-code" />
        <span>{refLabel(props)}</span>
      </button>
      {props.quote === true && (
        <button type="button" class="gw-link gw-code-ref-quote-toggle" onClick={() => setQuoteOpen(!isQuoteOpen)}>
          {t(isQuoteOpen ? 'research.hideQuote' : 'research.showQuote')}
        </button>
      )}
      {isQuoteOpen && <CodeQuote {...props} />}
    </span>
  );
}

function CodeQuote({ path, lineStart, lineEnd, absolute }: CodeRefProps): JSX.Element {
  const snippet = useResource('diff', `snippet:${path}:${lineStart}:${lineEnd}:${absolute}`, () => getFileSnippet(path, lineStart, lineEnd, absolute), { refetchOnState: false });
  return (
    <div class="gw-code-ref-quote">
      <ResourceView resource={snippet}>
        {(data) => (
          <CodeBlock
            code={data.lines.join('\n')}
            language={guessLanguage(path)}
            startLine={data.start ?? 1}
            highlight={data.highlight_start === undefined ? undefined : [data.highlight_start, data.highlight_end ?? data.highlight_start]}
            maxHeight={QUOTE_MAX_HEIGHT}
          />
        )}
      </ResourceView>
    </div>
  );
}
