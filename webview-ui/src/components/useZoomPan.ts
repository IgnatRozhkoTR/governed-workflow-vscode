import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

export interface ZoomPan {
  readonly scale: number;
  setScale(scale: number): void;
  setRestScale(scale: number): void;
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
}

function clampZoom(scale: number): number {
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale)) * 100) / 100;
}

function useWheelZoom(viewportRef: RefObject<HTMLElement>, isEnabled: boolean, zoomBy: (delta: number) => void): void {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!isEnabled || viewport === null) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomBy(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
      }
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [isEnabled]);
}

function useDragPan(viewportRef: RefObject<HTMLElement>): void {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return undefined;
    }
    let origin: { x: number; y: number; left: number; top: number } | undefined;
    const handleDown = (event: MouseEvent): void => {
      if (event.button !== 0 || (event.target as Element).closest('button, a, g.node') !== null) {
        return;
      }
      origin = { x: event.pageX, y: event.pageY, left: viewport.scrollLeft, top: viewport.scrollTop };
      viewport.classList.add('gw-dragging');
      event.preventDefault();
    };
    const handleMove = (event: MouseEvent): void => {
      if (origin !== undefined) {
        viewport.scrollLeft = origin.left - (event.pageX - origin.x);
        viewport.scrollTop = origin.top - (event.pageY - origin.y);
      }
    };
    const handleUp = (): void => {
      origin = undefined;
      viewport.classList.remove('gw-dragging');
    };
    viewport.addEventListener('mousedown', handleDown);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      viewport.removeEventListener('mousedown', handleDown);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, []);
}

export function useZoomPan(viewportRef: RefObject<HTMLElement>, isZoomable: boolean): ZoomPan {
  const [scale, setRawScale] = useState(1);
  const restScale = useRef(1);
  const zoomBy = (delta: number): void => setRawScale((current) => clampZoom(current + delta));
  useWheelZoom(viewportRef, isZoomable, zoomBy);
  useDragPan(viewportRef);
  return {
    scale,
    setScale: (next) => setRawScale(clampZoom(next)),
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(-ZOOM_STEP),
    setRestScale: (next) => {
      restScale.current = clampZoom(next);
      setRawScale(restScale.current);
    },
    reset: () => setRawScale(restScale.current),
  };
}
