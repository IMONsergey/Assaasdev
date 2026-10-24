import { useEffect, useLayoutEffect, useRef } from 'react';
import { useVisualPreferences } from './useVisualPreferences';
import './brand.css';

export function priceLabel(amount: number | undefined, currency = 'USD') {
  return typeof amount !== 'number' || !Number.isFinite(amount) ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
}

/** Exact, accessible prices update immediately; decorative digit reels interpolate independently. */
export function AnimatedPrice({ amount, currency = 'USD', className = '' }: { amount: number | undefined; currency?: string; className?: string }) {
  const label = priceLabel(amount, currency);
  const { reduced } = useVisualPreferences();
  const root = useRef<HTMLSpanElement>(null);
  const previous = useRef({ amount, label });
  const animations = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const oldValue = previous.current;
    previous.current = { amount, label };
    if (reduced || amount === oldValue.amount || !Number.isFinite(amount) || !Number.isFinite(oldValue.amount) || !root.current) {
      animations.current.forEach(animation => animation.cancel()); animations.current = [];
      return;
    }
    const direction = amount! > oldValue.amount! ? 1 : -1;
    const old = [...oldValue.label].reverse();
    const slots = root.current.querySelectorAll<HTMLElement>('.price-digit__reel');
    const nextAnimations: Animation[] = [];
    slots.forEach((reel, index) => {
      const place = Number(reel.dataset.place), digit = Number(reel.dataset.digit);
      const oldDigit = /\d/.test(old[place] ?? '') ? Number(old[place]) : 0;
      const active = reel.getAnimations();
      const height = reel.firstElementChild?.getBoundingClientRect().height ?? 0;
      if (!height || (!active.length && oldDigit === digit)) return;
      const current = active.length ? -new DOMMatrixReadOnly(getComputedStyle(reel).transform).m42 / height : 10 + oldDigit;
      const start = (((current % 10) + 10) % 10) + 10;
      const distance = direction > 0 ? (digit - (start % 10) + 10) % 10 : -(((start % 10) - digit + 10) % 10);
      active.forEach(animation => animation.cancel());
      nextAnimations.push(reel.animate([
        { transform: `translateY(${-start * height}px)` },
        { transform: `translateY(${-(start + distance) * height}px)` },
      ], { duration: 560, delay: (slots.length - index - 1) * 22, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'backwards' }));
    });
    animations.current.forEach(animation => { if (!nextAnimations.includes(animation)) animation.cancel(); });
    animations.current = nextAnimations;
  }, [amount, currency, label, reduced]);
  useEffect(() => () => animations.current.forEach(animation => animation.cancel()), []);

  return <span className={`price-amount ${className}`.trim()} ref={root}>
    <span className="sr-only">{label}</span>
    <span className="price-odometer" aria-hidden="true">{[...label].map((character, index) => /\d/.test(character)
      ? <span className="price-digit" key={label.length - index}><span className="price-digit__reel" data-digit={character} data-place={label.length - index - 1} style={{ transform: `translateY(-${((10 + Number(character)) * 100) / 30}%)` }}>{Array.from({ length: 30 }, (_, row) => <span key={row} data-numeral={row % 10} />)}</span></span>
      : <span className="price-symbol" key={label.length - index} data-numeral={character} />)}</span>
  </span>;
}
