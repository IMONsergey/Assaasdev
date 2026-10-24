import { useEffect, useRef, type CSSProperties } from 'react';
import { useVisualPreferences } from './useVisualPreferences';
import './brand.css';

const TAU = Math.PI * 2;
const PERIOD_SECONDS = 4.6;
const BASE_SPREAD = 0.26;
const SPREAD = 1.8;
const PERSPECTIVE = 3.5;
const TILT = 0.42;
const MAX_DPR = 2;
const MIN_DOT_RADIUS = 0.6;

export interface OrbCubeLoaderProps {
  /** Accessible status text. Localize it at the call site. */
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** Square dimensions in CSS pixels. Omit to use the CSS default or parent styles. */
  size?: number;
  /** Any CSS color, including a token such as var(--brand-mark). */
  color?: string;
  /** Number of dots; clamped to 30–450. */
  density?: number;
  /** Dot radius multiplier, relative to the original visual. */
  dotSize?: number;
  /** Cycle speed multiplier (1 = 4.6 seconds). */
  speed?: number;
  /** Rendering budget. Defaults to the site's standard 30 fps. */
  fps?: number;
  /** Draw a static frame instead of continuously animating. */
  paused?: boolean;
  /** Use inside an existing status wrapper without a nested announcement. */
  decorative?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function dotScale(size: number): number {
  if (size <= 46) return 0.4;
  if (size <= 190) return 0.4 + ((size - 46) / 144) * 0.6;
  if (size <= 340) return 1 + ((size - 190) / 150) * 0.55;
  return 1.55;
}

/** Original Fibonacci distribution, generated only when the density changes. */
function createPoints(count: number): Float32Array {
  const points = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (2 * i) / Math.max(1, count - 1);
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = 2.399963 * i;
    points[i * 3] = Math.cos(angle) * radius;
    points[i * 3 + 1] = y;
    points[i * 3 + 2] = Math.sin(angle) * radius;
  }
  return points;
}

/**
 * Morphs the sphere to a rounded cube, then projects and shades the dots.
 * Each dot occupies five consecutive Float32 values: x, y, radius, opacity, z.
 * x/y are offsets from the canvas center, in CSS pixels.
 */
function project(
  points: Float32Array,
  phase: number,
  size: number,
  radiusScale: number,
  out: Float32Array,
): number {
  const cos = Math.cos(TAU * phase);
  const sin = Math.sin(TAU * phase);
  const cosTilt = Math.cos(TILT);
  const sinTilt = Math.sin(TILT);
  const morph = (1 - Math.cos(TAU * phase)) * 0.5;
  const spread = size * BASE_SPREAD * SPREAD;
  let extent = 0;

  for (let i = 0; i < points.length / 3; i += 1) {
    const ix = i * 3;
    const x = points[ix]!;
    const y = points[ix + 1]!;
    const z = points[ix + 2]!;

    const maxAxis = Math.max(1e-4, Math.abs(x), Math.abs(y), Math.abs(z));
    const scale = 1 + (1 / maxAxis - 1) * morph * 0.62;
    const sx = x * scale;
    const sy = y * scale;
    const sz = z * scale;

    // Preserve the source animation's two rotations and fixed tilt.
    const firstX = sx * cos - sz * sin;
    const firstZ = sx * sin + sz * cos;
    const tiltedY = sy * cosTilt - firstZ * sinTilt;
    const tiltedZ = sy * sinTilt + firstZ * cosTilt;
    const rotatedX = firstX * cos - tiltedZ * sin;
    const rotatedZ = firstX * sin + tiltedZ * cos;

    const perspective = PERSPECTIVE / (PERSPECTIVE - rotatedZ);
    const depth = clamp((rotatedZ + 1.1) / 2.2, 0, 1);
    const projectedX = rotatedX * spread * perspective;
    const projectedY = tiltedY * spread * perspective;
    const radius = radiusScale * (0.4 + 1.6 * depth) * perspective * 0.85;
    const opacity = (0.07 + 0.93 * depth ** 1.55) * 0.9;
    const offset = i * 5;

    out[offset] = projectedX;
    out[offset + 1] = projectedY;
    out[offset + 2] = radius;
    out[offset + 3] = opacity;
    out[offset + 4] = rotatedZ;
    extent = Math.max(extent, Math.abs(projectedX) + radius * 0.5, Math.abs(projectedY) + radius * 0.5);
  }
  return extent;
}

/** Compute fit once per resize, not on every animation frame. */
function calculateFit(points: Float32Array, size: number, scratch: Float32Array): number {
  let extent = 0;
  for (let step = 0; step < 20; step += 1) {
    extent = Math.max(extent, project(points, step / 20, size, 1, scratch));
  }
  return extent > 1 ? clamp((size * 0.415) / extent, 0.55, 1.7) : 1;
}

/**
 * Self-contained Canvas 2D loading visual for React 19 + TypeScript.
 * No GSAP, Originkit runtime, pointer handlers or product/API dependencies.
 */
export default function OrbCubeLoader({
  label = 'Loading',
  className = '',
  style,
  size = 56,
  color = 'var(--accent)',
  density = size < 40 ? 90 : size < 80 ? 160 : 300,
  dotSize = 1.63,
  speed = 1,
  fps = 30,
  paused = false,
  decorative = false,
}: OrbCubeLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(0);
  const { reduced, theme } = useVisualPreferences();

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = canvas?.parentElement;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !wrapper || !ctx) return;

    const count = Math.round(clamp(density, 30, 450));
    const points = createPoints(count);
    const projected = new Float32Array(count * 5);
    const order = Array.from({ length: count }, (_, index) => index);
    const requestedFps = clamp(fps, 1, 60);
    const cycleSpeed = clamp(speed, 0, 4);
    const radiusMultiplier = clamp(dotSize, 0.1, 4);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let width = 0;
    let height = 0;
    let fit = 1;
    let visible = true;
    let raf = 0;
    let lastDraw = 0;
    let disposed = false;

    const shouldAnimate = () =>
      !paused && !reduced && !reducedMotion.matches && !document.hidden && visible && cycleSpeed > 0;

    const draw = () => {
      if (width < 2 || height < 2) return;
      const minSize = Math.min(width, height);
      project(points, phaseRef.current, minSize, dotScale(minSize) * radiusMultiplier, projected);
      order.sort((a, b) => projected[a * 5 + 4]! - projected[b * 5 + 4]!);

      ctx.clearRect(0, 0, width, height);
      // Resolve CSS custom properties and inherited theme colors at draw time.
      ctx.fillStyle = getComputedStyle(wrapper).color;
      const midX = width * 0.5;
      const midY = height * 0.5;

      for (const index of order) {
        const offset = index * 5;
        const x = projected[offset]!;
        const y = projected[offset + 1]!;
        const radius = projected[offset + 2]! * (0.55 + 0.45 * fit);
        let opacity = projected[offset + 3]!;
        if (radius <= 0.05 || opacity <= 0.004) continue;

        const drawnRadius = Math.max(MIN_DOT_RADIUS, radius);
        if (radius < MIN_DOT_RADIUS) opacity *= (radius / MIN_DOT_RADIUS) ** 2;
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(midX + x * fit, midY + y * fit, drawnRadius, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      raf = 0;
      if (disposed || !visible || document.hidden) return;
      const animate = shouldAnimate();
      const interval = 1000 / requestedFps;
      if (animate && lastDraw !== 0 && now - lastDraw < interval) {
        raf = requestAnimationFrame(tick);
        return;
      }

      if (animate && lastDraw !== 0) {
        const delta = Math.min((now - lastDraw) / 1000, 0.1);
        phaseRef.current = (phaseRef.current + (delta * cycleSpeed) / PERIOD_SECONDS) % 1;
      }
      draw();
      lastDraw = now;
      if (animate) raf = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lastDraw = 0;
    };

    const wake = () => {
      stop();
      if (!disposed && visible && !document.hidden) raf = requestAnimationFrame(tick);
    };

    const measure = () => {
      const rect = wrapper.getBoundingClientRect();
      const nextWidth = Math.max(0, rect.width);
      const nextHeight = Math.max(0, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const nextPixelWidth = Math.max(1, Math.round(nextWidth * dpr));
      const nextPixelHeight = Math.max(1, Math.round(nextHeight * dpr));
      const changed = width !== nextWidth || height !== nextHeight;

      width = nextWidth;
      height = nextHeight;
      if (canvas.width !== nextPixelWidth || canvas.height !== nextPixelHeight) {
        canvas.width = nextPixelWidth;
        canvas.height = nextPixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (changed && width >= 2 && height >= 2) {
        fit = calculateFit(points, Math.min(width, height), projected);
      }
      wake();
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(wrapper);
    const intersectionObserver = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) wake();
      else stop();
    });
    intersectionObserver.observe(wrapper);

    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else wake();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.addEventListener('change', wake);
    window.addEventListener('resize', measure, { passive: true });
    measure();

    return () => {
      disposed = true;
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedMotion.removeEventListener('change', wake);
      window.removeEventListener('resize', measure);
    };
  }, [density, dotSize, fps, paused, speed, reduced, theme, color]);

  return (
    <div
      className={`orb-cube-loader ${className}`.trim()}
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      style={{ ...(size === undefined ? null : { width: size, height: size }), color, ...style }}
    >
      <canvas ref={canvasRef} className="orb-cube-loader__canvas" aria-hidden="true" />
    </div>
  );
}
