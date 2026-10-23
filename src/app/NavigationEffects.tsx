import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';

const positions = new Map<string, number>();
const positionsByUrl = new Map<string, number>();

/** Keep history navigation useful without persisting query or account data. */
export function NavigationEffects() {
  const location = useLocation(), navigation = useNavigationType();
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  useLayoutEffect(() => {
    const key = location.key;
    const url = `${location.pathname}${location.search}`;
    const destination = navigation === 'POP' ? positions.get(key) : location.state?.restoreScroll ? positionsByUrl.get(url) : undefined;
    const changedPage = previousPath.current !== location.pathname;
    previousPath.current = location.pathname;
    let frame = 0, observer: ResizeObserver | null = null, timer = 0;
    const stop = () => { observer?.disconnect(); observer = null; window.clearTimeout(timer); };
    if (destination !== undefined) {
      const restore = () => {
        window.scrollTo({ top: destination, behavior: 'instant' });
        if (Math.abs(window.scrollY - destination) < 2) stop();
      };
      observer = new ResizeObserver(restore);
      observer.observe(document.body);
      timer = window.setTimeout(stop, 2000);
      restore();
    } else if (!location.hash && !(navigation === 'REPLACE' && !changedPage) && !location.state?.preserveTabFocus) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (changedPage && navigation !== 'POP' && !location.state?.focusSearch && !location.state?.preserveTabFocus) {
      frame = requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true }));
    }
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', stop);
    return () => {
      positions.set(key, window.scrollY);
      positionsByUrl.set(url, window.scrollY);
      if (positions.size > 80) positions.delete(positions.keys().next().value!);
      if (positionsByUrl.size > 80) positionsByUrl.delete(positionsByUrl.keys().next().value!);
      stop(); cancelAnimationFrame(frame);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [location.key, location.pathname, location.search, location.hash, location.state, navigation]);
  return null;
}
