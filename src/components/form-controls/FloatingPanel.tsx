import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface FloatingPanelProps {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onDismiss: (restoreFocus?: boolean) => void;
  children: ReactNode;
  className?: string;
  width?: number;
  heightLimit?: number;
  id?: string;
  role?: 'dialog' | 'listbox';
  label?: string;
  labelledBy?: string;
}

/** A control popup stays inside the native dialog's top layer, and follows its
 * anchor when the form or viewport scrolls. It never creates a second modal. */
export function FloatingPanel({ anchor, open, onDismiss, children, className = '', width, heightLimit, id, role, label, labelledBy }: FloatingPanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const [side, setSide] = useState('bottom');
  useLayoutEffect(() => {
    if (!open || !anchor.current || !panel.current) return;
    const element = anchor.current, popup = panel.current;
    let frame = 0;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0, topEdge = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth, viewportHeight = viewport?.height ?? window.innerHeight;
      const availableBelow = topEdge + viewportHeight - rect.bottom - 16;
      const availableAbove = rect.top - topEdge - 16;
      const preferredHeight = Math.min(popup.scrollHeight, viewportHeight - 16, heightLimit ?? Infinity);
      const above = availableBelow < preferredHeight && availableAbove > availableBelow;
      const actualWidth = Math.min(Math.max(width ?? rect.width, Math.min(208, viewportWidth - 16)), viewportWidth - 16);
      const maxHeight = Math.max(40, Math.min(above ? availableAbove : availableBelow, heightLimit ?? Infinity));
      const top = above ? Math.max(topEdge + 8, rect.top - Math.min(preferredHeight, maxHeight) - 6) : Math.max(topEdge + 8, rect.bottom + 6);
      const next: CSSProperties = { position: 'fixed', left: Math.max(leftEdge + 8, Math.min(rect.left, leftEdge + viewportWidth - actualWidth - 8)), top, width: actualWidth, maxHeight, visibility: 'visible' };
      setSide(above ? 'top' : 'bottom');
      setPosition(previous => Object.keys(next).every(key => previous[key as keyof CSSProperties] === next[key as keyof CSSProperties]) ? previous : next);
    };
    update();
    frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(element); observer.observe(popup);
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener('resize', update); document.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [open, anchor, width, heightLimit]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) dismiss.current(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const popups = document.querySelectorAll('[data-control-popup]');
      if (popups.item(popups.length - 1) !== panel.current) return;
      event.preventDefault(); event.stopImmediatePropagation(); dismiss.current(true);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); };
  }, [open, anchor]);
  if (!open || !anchor.current) return null;
  const host = anchor.current.closest('dialog[open]') ?? document.body;
  return createPortal(<div ref={panel} id={id} className={`control-popover ${className}`} data-control-popup="" data-side={side} role={role} aria-label={label} aria-labelledby={labelledBy} style={position}>{children}</div>, host);
}
