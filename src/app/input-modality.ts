import { useEffect } from 'react';

/** Restore semantic focus after dialogs without painting a keyboard ring after a tap. */
export function useInputModality() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.inputModality ??= 'pointer';
    const pointer = () => { root.dataset.inputModality = 'pointer'; };
    const keyboard = (event: KeyboardEvent) => {
      const editing = event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]');
      const choice = event.target instanceof Element && event.target.closest('select,input[type="radio"],input[type="checkbox"]');
      const navigationKey = (!editing || choice) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key);
      const choiceActivation = choice && (event.key === ' ' || event.key === 'Enter');
      const searchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (event.key === 'Tab' || navigationKey || choiceActivation || searchShortcut || (!editing && event.key === '/')) root.dataset.inputModality = 'keyboard';
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', keyboard, true);
    // Native select popups can consume keydown and return only keyup to the page.
    document.addEventListener('keyup', keyboard, true);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', keyboard, true);
      document.removeEventListener('keyup', keyboard, true);
    };
  }, []);
}
