import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Keep a single live region and its timers while moving it into the active modal. */
export function ToastRegion({ children, visible }: { children: ReactNode; visible: boolean }) {
  const [region] = useState(() => {
    const node = document.createElement('div');
    node.className = 'toast-region';
    node.setAttribute('popover', 'manual');
    node.setAttribute('role', 'region');
    node.setAttribute('aria-label', 'Notifications');
    return node;
  });
  const hasMessages = useRef(visible);
  hasMessages.current = visible;
  useLayoutEffect(() => {
    let modalStack: HTMLDialogElement[] = [];
    function placeRegion() {
      modalStack = modalStack.filter(dialog => dialog.isConnected && dialog.open);
      for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog:modal')) {
        if (!modalStack.includes(dialog)) modalStack.push(dialog);
      }
      const target = modalStack.at(-1) || document.body;
      if (region.parentElement !== target) {
        if (region.matches(':popover-open')) region.hidePopover();
        target.appendChild(region);
      }
      // A top-layer popover outside a modal is still inert. Moving the same
      // portal container inside it preserves focus, dismissibility and lifetime.
      if (hasMessages.current && typeof region.showPopover === 'function' && !region.matches(':popover-open')) region.showPopover();
    }
    placeRegion();
    const observer = new MutationObserver(placeRegion);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => { observer.disconnect(); region.remove(); };
  }, [region]);
  useLayoutEffect(() => {
    region.hidden = !visible;
    if (typeof region.showPopover !== 'function') return;
    if (region.matches(':popover-open')) region.hidePopover();
    if (visible && region.isConnected) region.showPopover();
  }, [children, region, visible]);
  return createPortal(children, region);
}
