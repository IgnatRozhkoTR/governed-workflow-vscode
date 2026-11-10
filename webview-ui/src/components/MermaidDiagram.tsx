import type { JSX, RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useT } from '../i18n/i18n';
import { computeFitScale } from '../lib/fitScale';
import { getMermaidInit, getMermaidTheme, isLightTheme, onThemeChange } from '../lib/mermaidTheme';
import { deduplicateSvgIds, hashText, mermaidNodeId } from '../lib/svg';
import { Dialog } from './Dialog';
import { IconButton } from './IconButton';
import { MermaidError } from './MermaidError';
import { Spinner } from './Spinner';
import { classNames } from './types';
import { useZoomPan, type ZoomPan } from './useZoomPan';

export interface MermaidDiagramProps {
  readonly source: string;
  readonly title?: string;
  readonly zoomable?: boolean;
  readonly fullscreen?: boolean;
  readonly fullscreenSource?: string;
  readonly fitHeight?: number;
  readonly fillsContainer?: boolean;
  readonly postProcess?: (svg: SVGSVGElement) => void;
  readonly onNodeClick?: (nodeId: string) => void;
}

interface RenderResult {
  readonly svg?: string;
  readonly error?: unknown;
}

const VIEWPORT_PADDING_PX = 16;
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

function fitScale(svg: SVGSVGElement, viewport: HTMLElement, fitHeight: number | undefined, fillsContainer: boolean): number {
  return computeFitScale({
    contentWidth: Number(svg.getAttribute('width')),
    contentHeight: Number(svg.getAttribute('height')),
    availableWidth: viewport.clientWidth - VIEWPORT_PADDING_PX,
    maxHeight: fillsContainer ? viewport.clientHeight - VIEWPORT_PADDING_PX : fitHeight,
  });
}

function useRefitOnResize(viewportRef: RefObject<HTMLElement>, refit: () => void): void {
  const latestRefit = useRef(refit);
  latestRefit.current = refit;
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    let width = viewport.clientWidth;
    const observer = new ResizeObserver(() => {
      if (viewport.clientWidth !== width) {
        width = viewport.clientWidth;
        latestRefit.current();
      }
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
}

export function MermaidDiagram(props: MermaidDiagramProps): JSX.Element {
  const { source, title, zoomable = true, fullscreen = true, fullscreenSource, fitHeight, fillsContainer = false, postProcess, onNodeClick } = props;
  const result = useMermaidSvg(source, useIsLightTheme());
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const zoom = useZoomPan(viewportRef, zoomable);
  const [isFullscreen, setFullscreen] = useState(false);
  const svgRef = useRef<SVGSVGElement>();
  const refit = (): void => {
    if (svgRef.current !== undefined && viewportRef.current !== null) {
      zoom.setRestScale(fitScale(svgRef.current, viewportRef.current, fitHeight, fillsContainer));
    }
  };
  useLayoutEffect(() => {
    svgRef.current = mountSvg(contentRef.current, result?.svg, postProcess);
    refit();
  }, [result?.svg]);
  useRefitOnResize(viewportRef, refit);
  if (result?.error !== undefined) {
    return <MermaidError error={result.error} source={source} title={title} />;
  }
  return (
    <figure class={classNames('gw-mermaid', fillsContainer && 'gw-mermaid-fill')}>
      {(title !== undefined || zoomable || fullscreen) && (
        <MermaidToolbar title={title} zoom={zoomable ? zoom : undefined} onFullscreen={fullscreen ? () => setFullscreen(true) : undefined} />
      )}
      <div ref={viewportRef} class="gw-mermaid-viewport" style={fitHeight === undefined ? undefined : { maxHeight: `${fitHeight + 20}px` }}>
        {result === undefined && <Spinner />}
        <div ref={contentRef} class="gw-mermaid-content" style={{ zoom: zoom.scale }} onClick={(event) => handleNodeClick(event, onNodeClick)} />
      </div>
      <MermaidFullscreenDialog
        isOpen={isFullscreen}
        title={title}
        source={fullscreenSource ?? source}
        postProcess={postProcess}
        onNodeClick={onNodeClick}
        onClose={() => setFullscreen(false)}
      />
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
  fixSvgSize(svg);
  deduplicateSvgIds(svg, `gwm${++mountCounter}`);
  postProcess?.(svg);
  return svg;
}

function fixSvgSize(svg: SVGSVGElement): void {
  const viewBox = svg.viewBox.baseVal;
  const rect = svg.getBoundingClientRect();
  svg.setAttribute('width', String(viewBox?.width || rect.width));
  svg.setAttribute('height', String(viewBox?.height || rect.height));
  svg.style.maxWidth = 'none';
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

interface MermaidFullscreenDialogProps extends Pick<MermaidDiagramProps, 'title' | 'postProcess' | 'onNodeClick'> {
  readonly isOpen: boolean;
  readonly source: string;
  readonly onClose: () => void;
}

function MermaidFullscreenDialog({ isOpen, title, source, postProcess, onNodeClick, onClose }: MermaidFullscreenDialogProps): JSX.Element {
  const t = useT();
  return (
    <Dialog open={isOpen} size="full" title={title ?? t('vsc.mermaid.fullscreen')} onClose={onClose}>
      <MermaidDiagram source={source} fullscreen={false} fillsContainer postProcess={postProcess} onNodeClick={onNodeClick} />
    </Dialog>
  );
}
