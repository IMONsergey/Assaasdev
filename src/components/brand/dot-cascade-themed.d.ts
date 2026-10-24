export type DotDirection = 'top-to-bottom' | 'bottom-to-top' | 'left-to-right' | 'right-to-left';
export interface DotOptions {
  spacing?: number;
  dotRadius?: number;
  direction?: DotDirection;
  startOpacity?: number;
  endOpacity?: number;
  /** @deprecated Use startOpacity. */
  topOpacity?: number;
  /** @deprecated Use endOpacity. */
  bottomOpacity?: number;
  hoverRadius?: number;
  displacement?: number;
  fps?: number;
  interactive?: boolean;
  color?: string;
}
export interface DotStats {
  supported: boolean;
  frames?: number;
  animating?: boolean;
  reducedMotion?: boolean;
  width?: number;
  height?: number;
  bufferWidth?: number;
  bufferHeight?: number;
  bufferBytes?: number;
  dotCount?: number;
  lastPaintedDots?: number;
  lastPaintedArea?: number;
  spacing?: number;
  influence?: number;
}
export interface DotController {
  update(options?: DotOptions): void;
  getStats(): DotStats;
  destroy(): void;
}
export function createDotCascade(
  canvas: HTMLCanvasElement,
  options?: DotOptions,
  host?: HTMLElement,
): DotController;
