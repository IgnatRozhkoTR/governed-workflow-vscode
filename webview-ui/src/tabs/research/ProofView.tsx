import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { getFileSnippet } from '../../api/core';
import { Badge } from '../../components/Badge';
import { CodeBlock } from '../../components/CodeBlock';
import { CodeRef } from '../../components/CodeRef';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Markdown } from '../../components/Markdown';
import { ResourceView } from '../../components/ResourceView';
import { StructuredValue } from '../../components/StructuredValue';
import { toasts } from '../../components/ToastHost';
import { useT } from '../../i18n/i18n';
import { guessLanguage } from '../../lib/markdown';
import { rpc } from '../../rpc/rpcClient';
import { useResource } from '../../store/hooks';
import { abbreviateCommit, isAbsolutePath, isMarkdownPath, type Proof } from './findings';

type CodeProof = Extract<Proof, { kind: 'code' }>;

const QUOTE_MAX_HEIGHT = 320;

function RemoteQuote({ proof, start, end }: { readonly proof: CodeProof; readonly start: number; readonly end: number }): JSX.Element {
  const absolute = isAbsolutePath(proof.file);
  const snippet = useResource('diff', `quote:${proof.file}:${start}:${end}`, () => getFileSnippet(proof.file, start, end, absolute), { refetchOnState: false });
  return (
    <ResourceView resource={snippet}>
      {(data) => (
        <CodeBlock
          code={data.lines.join('\n')}
          language={guessLanguage(proof.file)}
          startLine={data.start ?? start}
          highlight={proofHighlight(proof)}
          maxHeight={QUOTE_MAX_HEIGHT}
        />
      )}
    </ResourceView>
  );
}

function proofHighlight(proof: CodeProof): readonly [number, number] | undefined {
  return proof.lineStart === undefined ? undefined : [proof.lineStart, proof.lineEnd ?? proof.lineStart];
}

function QuoteToggle({ proof }: { readonly proof: CodeProof }): JSX.Element | null {
  const t = useT();
  const [isOpen, setOpen] = useState(false);
  const hasRange = proof.snippetStart !== undefined && proof.snippetEnd !== undefined;
  if (!hasRange && proof.snippet === undefined) {
    return null;
  }
  return (
    <>
      <button type="button" class="gw-link" onClick={() => setOpen(!isOpen)}>
        {t(isOpen ? 'research.hideQuote' : 'research.showQuote')}
      </button>
      {isOpen && (
        <div class="gw-research-quote">
          {hasRange ? (
            <RemoteQuote proof={proof} start={proof.snippetStart as number} end={proof.snippetEnd as number} />
          ) : (
            <CodeBlock code={proof.snippet ?? ''} language={guessLanguage(proof.file)} maxHeight={QUOTE_MAX_HEIGHT} />
          )}
        </div>
      )}
    </>
  );
}

function MarkdownBody({ path }: { readonly path: string }): JSX.Element {
  const file = useResource('diff', `preview:${path}`, () => getFileSnippet(path, undefined, undefined, isAbsolutePath(path)), { refetchOnState: false });
  return <ResourceView resource={file}>{(data) => <Markdown source={data.lines.join('\n')} />}</ResourceView>;
}

function MarkdownPreviewButton({ path }: { readonly path: string }): JSX.Element {
  const t = useT();
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <IconButton icon="open-preview" title={t('vsc.research.preview')} onClick={() => setOpen(true)} />
      {isOpen && (
        <Dialog open title={path} size="lg" onClose={() => setOpen(false)}>
          <MarkdownBody path={path} />
        </Dialog>
      )}
    </>
  );
}

function CodeProofView({ proof }: { readonly proof: CodeProof }): JSX.Element {
  return (
    <div class="gw-research-proof">
      <CodeRef path={proof.file} lineStart={proof.lineStart} lineEnd={proof.lineEnd} absolute={isAbsolutePath(proof.file)} />
      {isMarkdownPath(proof.file) && <MarkdownPreviewButton path={proof.file} />}
      <QuoteToggle proof={proof} />
    </div>
  );
}

function openUrl(url: string): void {
  rpc.call('native.openExternal', { url }).catch(toasts.error);
}

export function ProofView({ proof }: { readonly proof: Proof }): JSX.Element | null {
  const t = useT();
  switch (proof.kind) {
    case 'none':
      return null;
    case 'code':
      return <CodeProofView proof={proof} />;
    case 'web':
      return (
        <div class="gw-research-proof gw-research-proof-web">
          <button type="button" class="gw-link" title={proof.url} onClick={() => openUrl(proof.url)}>
            <Icon name="globe" />
            <span>{proof.title ?? proof.url}</span>
          </button>
          {proof.quote !== undefined && <blockquote class="gw-research-web-quote">{proof.quote}</blockquote>}
        </div>
      );
    case 'diff':
      return (
        <div class="gw-research-proof">
          <Badge icon="git-commit" label={abbreviateCommit(proof.commit)} title={t('vsc.research.commit', { commit: proof.commit })} tone="info" />
          {proof.file !== undefined && <span class="gw-research-proof-file">{proof.file}</span>}
          {proof.description !== undefined && <div class="gw-research-diff-description">{proof.description}</div>}
        </div>
      );
    case 'unknown':
      return <StructuredValue value={proof.value} />;
  }
}
