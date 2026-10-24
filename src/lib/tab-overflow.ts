import { useEffect, useRef, useState } from 'react';

/** Reveal the selected tab without moving the page; fade only overflowing edges. */
export function useTabOverflow(value: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<'start' | 'end' | 'both' | undefined>();
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const measure = () => {
      const start = list.scrollLeft > 1;
      const end = list.scrollWidth - list.clientWidth - list.scrollLeft > 1;
      setOverflow(start && end ? 'both' : start ? 'start' : end ? 'end' : undefined);
    };
    const reveal = () => {
      const selected = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (selected && list.scrollWidth > list.clientWidth) {
        const bounds = list.getBoundingClientRect(), item = selected.getBoundingClientRect();
        if (item.left < bounds.left + 14) list.scrollLeft -= bounds.left - item.left + 14;
        else if (item.right > bounds.right - 14) list.scrollLeft += item.right - bounds.right + 14;
      }
      measure();
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(list);
    for (const child of list.children) observer.observe(child);
    list.addEventListener('scroll', measure, { passive: true });
    return () => { observer.disconnect(); list.removeEventListener('scroll', measure); };
  }, [value]);
  return { ref, overflow };
}
