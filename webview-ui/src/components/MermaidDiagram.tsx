import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useT } from '../i18n/i18n';
import { getMermaidInit, getMermaidTheme, isLightTheme, onThemeChange } from '../lib/mermaidTheme';
import { deduplicateSvgIds, hashText, mermaidNodeId } from '../lib/svg';
import { CodeBlock } from './CodeBlock';
import { ErrorBanner } from './ErrorBanner';
import { IconButton } from './IconButton';
import { Spinner } from './Spinner';
import { useZoomPan, type ZoomPan } from './useZoomPan';

export interface MermaidDiagramProps {
  readonly source: string;
  readonly title?: string;
  readonly zoomable?: boolean;
  readonly fullscreen?: boolean;
  readonly fullscreenSource?: string;
  readonly fitHeight?: number;
  readonly postProcess?: (svg: SVGSVGElement) => void;
  readonly onNodeClick?: (nodeId: string) => void;
}

interface RenderResult {
  readonly svg?: string;
  readonly error?: unknown;
}

const MIN_FIT_SCALE = 0.3;
const svgCache = new Map<string, Promise<string>>();
let renderCounter = 0;

async function renderSvg(source: string): Promise<string> {
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', ...getMermaidTheme() });
  const id = `gw-mermaid-${++renderCounter}`;
  try {
    return (await mermaid.render(id, `${getMermaidInit()}\n${source}`)).svg;
  } finally {
    document.getElementById(`d${id}`)?.remove();
  }
}

function cachedSvg(source: string, isLight: boolean): Promise<string> {
  const key = hashText(`${isLight ? 'light' : 'dark'}\n${source}`);
  const cached = svgCache.get(key) ?? renderSvg(source);
  svgCache.set(key, cached);
  cached.catch(() => svgCache.delete(key));
  return cached;
}

function useIsLightTheme(): boolean {
  const [isLight, setLight] = useState(isLightTheme);
  useEffect(() => onThemeChange(() => setLight(isLightTheme())), []);
  return isLight;
}

function useMermaidSvg(source: string, isLight: boolean): RenderResult | undefined {
  const [result, setResult] = useState<RenderResult | undefined>(undefined);
  useEffect(() => {
    let isCurrent = true;
    cachedSvg(source, isLight).then(
      (svg) => isCurrent && setResult({ svg }),
      (error: unknown) => isCurrent && setResult({ error }),
    );
    return () => {
      isCurrent = false;
    };
  }, [source, isLight]);
  return result;
}

function fitScale(svg: SVGSVGElement, fitHeight: number): number {
  const height = svg.viewBox.baseVal?.height || svg.getBoundingClientRect().height;
  return height > fitHeight ? Math.max(MIN_FIT_SCALE, fitHeight / height) : 1;
}

export function MermaidDiagram(props: MermaidDiagramProps): JSX.Element {
  const { source, title, zoomable = true, fullscreen = true, fullscreenSource, fitHeight, postProcess, onNodeClick } = props;
  const result = useMermaidSvg(source, useIsLightTheme());
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const zoom = useZoomPan(viewportRef, zoomable);
  const [isFullscreen, setFullscreen] = useState(false);
  useLayoutEffect(() => {
    const svg = mountSvg(contentRef.current, result?.svg, postProcess);
    if (svg !== undefined && fitHeight !== undefined) {
      zoom.setScale(fitScale(svg, fitHeight));
    }
  }, [result?.svg]);
  if (result?.error !== undefined) {
    return <MermaidError error={result.error} source={source} />;
  }
  return (
    <figure class="gw-mermaid">
      {(title !== undefined || zoomable || fullscreen) && (
        <MermaidToolbar title={title} zoom={zoomable ? zoom : undefined} onFullscreen={fullscreen ? () => setFullscreen(true) : undefined} />
      )}
      <div ref={viewportRef} class="gw-mermaid-viewport" style={fitHeight === undefined ? undefined : { maxHeight: `${fitHeight + 20}px` }}>
        {result === undefined && <Spinner />}
        <div ref={contentRef} class="gw-mermaid-content" style={{ zoom: zoom.scale }} onClick={(event) => handleNodeClick(event, onNodeClick)} />
      </div>
      {isFullscreen && (
        <MermaidOverlay title={title} source={fullscreenSource ?? source} postProcess={postProcess} onNodeClick={onNodeClick} onClose={() => setFullscreen(false)} />
      )}
    </figure>
  );
}

let mountCounter = 0;

function mountSvg(content: HTMLElement | null, svgMarkup: string | undefined, postProcess: MermaidDiagramProps['postProcess']): SVGSVGElement | undefined {
  if (content === null || svgMarkup === undefined) {
    return undefined;
  }
  content.innerHTML = svgMarkup;
  const svg = content.querySelector('svg');
  if (svg === null) {
    return undefined;
  }
  deduplicateSvgIds(svg, `gwm${++mountCounter}`);
  postProcess?.(svg);
  return svg;
}

function handleNodeClick(event: MouseEvent, onNodeClick: MermaidDiagramProps['onNodeClick']): void {
  const node = onNodeClick === undefined ? null : (event.target as Element).closest('g.node');
  const nodeId = node === null ? undefined : mermaidNodeId(node);
  if (nodeId !== undefined) {
    onNodeClick?.(nodeId);
  }
}

interface MermaidToolbarProps {
  readonly title?: string;
  readonly zoom?: ZoomPan;
  readonly onFullscreen?: () => void;
}

function MermaidToolbar({ title, zoom, onFullscreen }: MermaidToolbarProps): JSX.Element {
  const t = useT();
  return (
    <figcaption class="gw-mermaid-toolbar">
      <span class="gw-mermaid-title">{title}</span>
      {zoom !== undefined && (
        <>
          <IconButton icon="zoom-out" title={t('vsc.mermaid.zoomOut')} onClick={zoom.zoomOut} />
          <span class="gw-mermaid-zoom-level">{Math.round(zoom.scale * 100)}%</span>
          <IconButton icon="zoom-in" title={t('vsc.mermaid.zoomIn')} onClick={zoom.zoomIn} />
          <IconButton icon="discard" title={t('vsc.mermaid.resetZoom')} onClick={zoom.reset} />
        </>
      )}
      {onFullscreen !== undefined && <IconButton icon="screen-full" title={t('vsc.mermaid.fullscreen')} onClick={onFullscreen} />}
    </figcaption>
  );
}

interface MermaidOverlayProps extends Pick<MermaidDiagramProps, 'title' | 'postProcess' | 'onNodeClick'> {
  readonly source: string;
  readonly onClose: () => void;
}

function MermaidOverlay({ title, source, postProcess, onNodeClick, onClose }: MermaidOverlayProps): JSX.Element {
  const t = useT();
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);
  return (
    <div class="gw-mermaid-overlay" role="dialog" aria-modal="true" aria-label={title ?? t('vsc.mermaid.fullscreen')}>
      <div class="gw-mermaid-overlay-header">
        <IconButton icon="close" title={t('buttons.close')} onClick={onClose} />
      </div>
      <MermaidDiagram source={source} title={title} fullscreen={false} postProcess={postProcess} onNodeClick={onNodeClick} />
    </div>
  );
}

function MermaidError({ error, source }: { readonly error: unknown; readonly source: string }): JSX.Element {
  return (
    <div class="gw-mermaid gw-mermaid-error">
      <ErrorBanner error={error} />
      <CodeBlock code={source} />
    </div>
  );
}
