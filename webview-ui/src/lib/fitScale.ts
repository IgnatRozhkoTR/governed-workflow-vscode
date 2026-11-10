// Below this scale node labels become unreadable; a wider diagram keeps this scale and scrolls horizontally instead.
export const MIN_READABLE_SCALE = 0.6;

export interface FitInput {
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly availableWidth: number;
  readonly maxHeight?: number;
}

export function computeFitScale({ contentWidth, contentHeight, availableWidth, maxHeight }: FitInput): number {
  if (contentWidth <= 0 || availableWidth <= 0) {
    return 1;
  }
  const widthScale = availableWidth / contentWidth;
  const heightScale = maxHeight !== undefined && contentHeight > 0 ? maxHeight / contentHeight : 1;
  return Math.max(MIN_READABLE_SCALE, Math.min(1, widthScale, heightScale));
}
