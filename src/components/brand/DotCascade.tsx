import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createDotCascade, type DotOptions, type DotController } from './dot-cascade-themed.js';
import { useVisualPreferences } from './useVisualPreferences';
import './brand.css';

export interface DotCascadeProps extends DotOptions {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  overlay?: boolean;
  onReady?: (ready: boolean) => void;
}

/** The APCOSYS dot field: decorative, pointer-responsive and idle when the pointer rests. */
export function DotCascade({ children, className = '', style, overlay = false,
  direction = 'top-to-bottom', topOpacity, bottomOpacity, spacing = 24, dotRadius = 1.1,
  startOpacity = topOpacity ?? 0.24, endOpacity = bottomOpacity ?? 0.03,
  hoverRadius = 150, displacement = 3, fps = 30, interactive = true, color = 'var(--accent)', onReady,
}: DotCascadeProps) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<DotController | null>(null);
  const { reduced, theme } = useVisualPreferences();
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    if (!canvas.current || !host.current) return;
    const surface = host.current.closest<HTMLElement>('article, section');
    const target = overlay ? surface || host.current.parentElement || host.current : host.current;
    controller.current = createDotCascade(canvas.current, {}, target);
    ready.current?.(controller.current.getStats().supported);
    return () => { controller.current?.destroy(); controller.current = null; ready.current?.(false); };
  }, [overlay]);

  useEffect(() => {
    if (!host.current) return;
    controller.current?.update({ spacing, dotRadius, startOpacity, endOpacity, direction,
      hoverRadius, displacement, fps, interactive: interactive && !reduced,
      color: getComputedStyle(host.current).color });
  }, [spacing, dotRadius, startOpacity, endOpacity, direction, hoverRadius, displacement, fps, interactive, reduced, theme, color, overlay]);

  const appearance = { color, ...style, '--dc-gap': `${spacing}px`, '--dc-dot-radius': `${dotRadius}px`,
    '--dc-start-opacity': startOpacity, '--dc-end-opacity': endOpacity,
    '--dc-direction': { 'top-to-bottom': 'to bottom', 'bottom-to-top': 'to top', 'left-to-right': 'to right', 'right-to-left': 'to left' }[direction],
  } as CSSProperties;

  return <div ref={host} className={`dot-cascade ${overlay ? 'dot-cascade--overlay' : ''} ${className}`.trim()} style={appearance}>
    <div className="dot-cascade__fallback" aria-hidden="true" />
    <canvas ref={canvas} className="dot-cascade__canvas" aria-hidden="true" />
    {children != null && <div className="dot-cascade__content">{children}</div>}
  </div>;
}
