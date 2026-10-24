import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from './ui';
import './toast.css';

export function ToastMessage({ message, tone, onDismiss }: { message: string; tone: 'success' | 'error' | 'info'; onDismiss: () => void }) {
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false), [leaving, setLeaving] = useState(false);
  const remaining = useRef(tone === 'error' ? 10_000 : 6_000);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismissCallback = useRef(onDismiss);
  dismissCallback.current = onDismiss;
  function dismiss() {
    if (exitTimer.current) return;
    setLeaving(true);
    const reduced = document.documentElement.dataset.reducedMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    exitTimer.current = setTimeout(() => dismissCallback.current(), reduced ? 0 : 180);
  }
  useEffect(() => {
    if (hovered || focused || leaving) return;
    const start = performance.now();
    const timer = setTimeout(dismiss, remaining.current);
    return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (performance.now() - start)); };
  }, [hovered, focused, leaving]);
  useEffect(() => () => clearTimeout(exitTimer.current), []);
  return <div className={`toast toast--${tone} toast--polished${leaving ? ' is-leaving' : ''}`} role={tone === 'error' ? 'alert' : 'status'} aria-atomic="true" data-paused={hovered || focused || undefined} style={{ '--toast-duration': `${tone === 'error' ? 10_000 : 6_000}ms` } as CSSProperties} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <span className="toast-signal" aria-hidden="true"><Icon name={tone === 'success' ? 'check' : tone === 'error' ? 'alert' : 'info'} size={17} /></span>
    <span className="toast-copy">{message}</span>
    <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={dismiss}><Icon name="close" size={15} /></button>
    <span className="toast-lifetime" aria-hidden="true" />
  </div>;
}
