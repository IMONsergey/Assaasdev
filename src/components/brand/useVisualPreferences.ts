import { useSyncExternalStore } from 'react';

/** Canvas and WAAPI animations follow the same preference as the application's CSS. */
function snapshot() {
  if (typeof document === 'undefined') return 'reduced:light';
  const root = document.documentElement;
  const reduced = root.dataset.reducedMotion === 'true' || root.dataset.motion === 'reduced'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return `${reduced ? 'reduced' : 'full'}:${root.dataset.theme ?? 'light'}`;
}

function subscribe(callback: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-reduced-motion', 'data-motion'] });
  media.addEventListener('change', callback);
  return () => { observer.disconnect(); media.removeEventListener('change', callback); };
}

export function useVisualPreferences() {
  const value = useSyncExternalStore(subscribe, snapshot, () => 'reduced:light');
  return { reduced: value.startsWith('reduced:'), theme: value.split(':')[1] };
}
