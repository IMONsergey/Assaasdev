let locks = 0;
let previousBodyOverflow = '';
let previousRootOverflow = '';

/** Shared by native dialogs and the mobile drawer, including nested overlays. */
export function lockPageScroll(): () => void {
  if (locks++ === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    }
  };
}
