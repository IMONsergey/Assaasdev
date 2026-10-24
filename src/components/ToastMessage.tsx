import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

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
    exitTimer.current = setTimeout(() => dismissCallback.current(), reduced ? 0 : 140);
  }
  useEffect(() => {
    if (hovered || focused || leaving) return;
    const start = performance.now();
    const timer = setTimeout(dismiss, remaining.current);
    return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (performance.now() - start)); };
  }, [hovered, focused, leaving]);
  useEffect(() => () => clearTimeout(exitTimer.current), []);
  return <div className={`toast toast--${tone}${leaving ? ' is-leaving' : ''}`} role={tone === 'error' ? 'alert' : 'status'} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <Icon name={tone === 'success' ? 'success' : tone === 'error' ? 'alert' : 'info'} size={20} />
    <span>{message}</span>
    <button type="button" aria-label="Dismiss notification" onClick={dismiss}><Icon name="close" size={16} /></button>
  </div>;
}
