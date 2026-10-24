import { Fragment, useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { FloatingPanel } from './FloatingPanel';
import { ControlIcon } from './shared';

export interface ComboBoxOption { value: string; label?: string; group?: string; description?: string; disabled?: boolean }
export interface ComboBoxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'list' | 'type'> {
  label: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<ComboBoxOption | string>;
  hint?: ReactNode;
  error?: ReactNode;
  allowCustom?: boolean;
  filterOptions?: boolean;
  displaySelectedLabel?: boolean;
  loading?: boolean;
}

/** Suggestions remain optional: dynamic API field names and values can be
 * entered directly without being forced into a fixed client-side vocabulary. */
export function ComboBoxField({ label, value, onValueChange, options, hint, error, id: explicit, className = '', allowCustom = true, filterOptions = true, displaySelectedLabel = false, loading, disabled, onFocus, onBlur, onKeyDown, ...props }: ComboBoxFieldProps) {
  const generated = useId(), id = explicit ?? generated, listId = `${id}-suggestions`;
  const input = useRef<HTMLInputElement>(null), anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1), [typing, setTyping] = useState(false);
  const [localQuery, setLocalQuery] = useState(value);
  const choices = useMemo(() => options.map(option => typeof option === 'string' ? { value: option } : option), [options]);
  const selected = choices.find(option => option.value === value);
  const query = allowCustom ? value : localQuery;
  const filtered = useMemo(() => choices.filter(option => !filterOptions || !typing || !query || `${option.label ?? ''} ${option.value} ${option.description ?? ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 80), [choices, filterOptions, typing, query]);
  const shownValue = displaySelectedLabel && !typing && selected?.label ? selected.label : !allowCustom && typing ? localQuery : value;
  const popupOpen = open && (filtered.length > 0 || !!loading);
  const close = (restore = false) => { setOpen(false); setActive(-1); if (restore) input.current?.focus({ preventScroll: true }); };
  function choose(option: ComboBoxOption) { if (option.disabled) return; onValueChange(option.value); setTyping(false); close(true); }
  useEffect(() => { setActive(-1); }, [value]);
  useEffect(() => { if (!allowCustom) { setLocalQuery(value); setTyping(false); } }, [value, allowCustom]);
  useEffect(() => { if (disabled) close(); }, [disabled]);
  useEffect(() => { if (open && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [open, active, listId]);
  return <div className={`field ${className}`}>
    <label htmlFor={id}>{label}</label>
    <div ref={anchor} className="form-combobox" data-open={popupOpen || undefined}>
      <input {...props} ref={input} id={id} type="text" value={shownValue} disabled={disabled} role="combobox" aria-autocomplete="list" aria-controls={popupOpen ? listId : undefined} aria-expanded={popupOpen} aria-activedescendant={popupOpen && active >= 0 ? `${listId}-${active}` : undefined} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} autoComplete="off" spellCheck={false} onChange={event => { setTyping(true); setOpen(true); setLocalQuery(event.target.value); setActive(-1); if (allowCustom) onValueChange(event.target.value); }} onFocus={event => { setOpen(true); onFocus?.(event); }} onBlur={event => { if (!anchor.current?.contains(event.relatedTarget) && !(event.relatedTarget as HTMLElement | null)?.closest('[data-control-popup]')) { close(); if (selected) setTyping(false); } onBlur?.(event); }} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          const direction = event.key === 'ArrowDown' ? 1 : -1;
          let next = active < 0 && direction < 0 ? 0 : active;
          for (let count = 0; count < filtered.length; count++) { next = (next + direction + filtered.length) % filtered.length; if (!filtered[next].disabled) { setActive(next); break; } }
        } else if (event.key === 'Enter' && open && active >= 0 && filtered[active]) { event.preventDefault(); choose(filtered[active]); }
        else if (event.key === 'Tab') close();
        onKeyDown?.(event);
      }} />
      <button type="button" tabIndex={-1} disabled={disabled} aria-label={`Show ${typeof label === 'string' ? label.toLowerCase() : 'field'} suggestions`} className="combobox-toggle" onMouseDown={event => event.preventDefault()} onClick={() => { const next = !popupOpen; input.current?.focus({ preventScroll: true }); setOpen(next); }}><ControlIcon name="chevron-down" /></button>
    </div>
    <FloatingPanel anchor={anchor} open={popupOpen} onDismiss={close} heightLimit={320} id={listId} role="listbox" label={typeof label === 'string' ? `${label} suggestions` : 'Suggestions'} className="combobox-popover">
      {loading && !filtered.length && <div className="control-no-options" role="status">Loading options…</div>}
      {filtered.map((option, index) => <Fragment key={option.value}>
        {option.group && (index === 0 || filtered[index - 1].group !== option.group) && <div className="control-option-group" aria-hidden="true">{option.group}</div>}
        <div id={`${listId}-${index}`} role="option" data-value={option.value} aria-selected={value === option.value} aria-disabled={option.disabled || undefined} className={`control-option control-option--detail${active === index ? ' is-active' : ''}`} onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}><span><span>{option.label || option.value}</span>{option.description && <small>{option.description}</small>}{option.label && option.label !== option.value && <code>{option.value}</code>}</span>{value === option.value && <ControlIcon name="check" />}</div>
      </Fragment>)}
    </FloatingPanel>
    {error ? <span id={`${id}-error`} className="field-error" role="alert">{error}</span> : hint ? <span id={`${id}-hint`} className="field-hint">{hint}</span> : null}
  </div>;
}
