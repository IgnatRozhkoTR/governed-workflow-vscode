import { render, type JSX } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { MERMAID_SLOT_CLASS, MermaidSourceError, readMermaidSource, renderMarkdown } from '../lib/markdown';
import { rpc } from '../rpc/rpcClient';
import { MermaidDiagram } from './MermaidDiagram';
import { MermaidError } from './MermaidError';
import { toasts } from './ToastHost';
import { classNames } from './types';

export interface MarkdownProps {
  readonly source: string;
  readonly mermaid?: boolean;
  readonly className?: string;
  readonly compact?: boolean;
}

const EXTERNAL_LINK_PATTERN = /^https?:\/\//i;
const FILE_LINK_PATTERN = /^([^:#?]+?)(?::(\d+)(?:-(\d+))?)?$/;

export function Markdown({ source, mermaid = true, className, compact = false }: MarkdownProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(source, mermaid), [source, mermaid]);
  useEffect(() => {
    const container = ref.current;
    if (container === null) {
      return undefined;
    }
    container.innerHTML = html;
    return mountMermaidSlots(container);
  }, [html]);
  return <div ref={ref} class={classNames('gw-markdown', compact && 'gw-markdown-compact', className)} onClick={handleLinkClick} />;
}

function mountMermaidSlots(container: HTMLElement): () => void {
  const slots = Array.from(container.querySelectorAll<HTMLElement>(`.${MERMAID_SLOT_CLASS}`));
  slots.forEach((slot) => render(mermaidSlotContent(slot), slot));
  return () => slots.forEach((slot) => render(null, slot));
}

function mermaidSlotContent(slot: Element): JSX.Element {
  try {
    return <MermaidDiagram source={readMermaidSource(slot)} />;
  } catch (error) {
    if (error instanceof MermaidSourceError) {
      return <MermaidError error={error} />;
    }
    throw error;
  }
}

function handleLinkClick(event: MouseEvent): void {
  const link = (event.target as Element | null)?.closest('a');
  const href = link?.getAttribute('href');
  if (href === undefined || href === null || href === '') {
    return;
  }
  event.preventDefault();
  followLink(href).catch(toasts.error);
}

async function followLink(href: string): Promise<void> {
  if (EXTERNAL_LINK_PATTERN.test(href)) {
    await rpc.call('native.openExternal', { url: href });
    return;
  }
  if (href.startsWith('#')) {
    document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const match = FILE_LINK_PATTERN.exec(href);
  if (match !== null) {
    const line = match[2] === undefined ? undefined : Number(match[2]);
    const endLine = match[3] === undefined ? undefined : Number(match[3]);
    await rpc.call('native.openFile', { path: decodeURIComponent(match[1] ?? href), line, endLine });
  }
}
