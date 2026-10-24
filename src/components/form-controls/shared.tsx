import { Children, isValidElement, type ChangeEvent, type ReactNode } from 'react';
import { asset } from '../../config';

export function textFromNode(node: ReactNode): string {
  return Children.toArray(node).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? textFromNode(child.props.children) : '').join('');
}

export function ControlIcon({ name, className = '' }: { name: 'chevron-down' | 'chevron-left' | 'chevron-right' | 'check' | 'search' | 'calendar' | 'x'; className?: string }) {
  return <span className={`control-icon ${className}`} style={{ maskImage: `url("${asset(`icons/${name}.svg`)}")`, WebkitMaskImage: `url("${asset(`icons/${name}.svg`)}")` }} aria-hidden="true" />;
}

/** Compatibility bridge for the existing Field callbacks. New consumers can
 * use onValueChange directly; existing callbacks read target.value only. */
export function valueEvent<T extends HTMLInputElement | HTMLSelectElement>(value: string, element?: HTMLElement | null): ChangeEvent<T> {
  const target = { value, name: element?.getAttribute('name') ?? '', id: element?.id ?? '' } as T;
  return { target, currentTarget: target, type: 'change', bubbles: true, cancelable: false, defaultPrevented: false, eventPhase: 3, isTrusted: false, nativeEvent: new Event('change'), timeStamp: performance.now(), preventDefault() {}, stopPropagation() {}, isDefaultPrevented: () => false, isPropagationStopped: () => false, persist() {} };
}
