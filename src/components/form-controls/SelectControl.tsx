import { Children, Fragment, isValidElement, useEffect, useId, useMemo, useRef, useState, type ReactNode, type SelectHTMLAttributes, type KeyboardEvent } from 'react';
import { FloatingPanel } from './FloatingPanel';
import { ControlIcon, textFromNode, valueEvent } from './shared';

interface Choice { value: string; label: ReactNode; text: string; disabled: boolean; group?: string }
function choicesFromChildren(children: ReactNode, group?: string, disabled = false): Choice[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; label?: string; disabled?: boolean }>(child)) return [];
    if (child.type === Fragment) return choicesFromChildren(child.props.children, group, disabled);
    if (child.type === 'optgroup') return choicesFromChildren(child.props.children, child.props.label, disabled || !!child.props.disabled);
    if (child.type !== 'option') return [];
    const text = child.props.label ?? textFromNode(child.props.children);
    return [{ value: String(child.props.value ?? text), label: child.props.label ?? child.props.children, text, disabled: disabled || !!child.props.disabled, group }];
  });
}

export type SelectControlProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'multiple' | 'size'> & { searchable?: boolean; placeholder?: string; onValueChange?: (value: string) => void };

export function SelectControl({ id: explicit, value, defaultValue, onChange, onValueChange, children, disabled, required, name, className = '', searchable, placeholder = 'Choose an option', onFocus, onBlur, onKeyDown, ...rest }: SelectControlProps) {
  const generated = useId(), id = explicit ?? generated, listId = `${id}-options`;
  const trigger = useRef<HTMLButtonElement>(null), search = useRef<HTMLInputElement>(null), submission = useRef<HTMLInputElement>(null);
  const choices = useMemo(() => choicesFromChildren(children), [children]);
  const [localValue, setLocalValue] = useState(String(defaultValue ?? value ?? choices[0]?.value ?? ''));
  const selectedValue = value === undefined ? localValue : String(value);
  const selected = choices.find(choice => choice.value === selectedValue);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(-1), [invalid, setInvalid] = useState(false);
  const typeahead = useRef({ value: '', at: 0 });
  const filtered = useMemo(() => choices.filter(choice => !query || `${choice.text} ${choice.value} ${choice.group ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())), [choices, query]);
  const hasSearch = searchable ?? choices.length > 10;
  const close = (restore = false) => { setOpen(false); setQuery(''); if (restore) requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); };
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (selectedValue) setInvalid(false); }, [selectedValue]);
  useEffect(() => {
    if (!open) return;
    const chosen = filtered.findIndex(choice => choice.value === selectedValue && !choice.disabled);
    setActive(chosen >= 0 ? chosen : filtered.findIndex(choice => !choice.disabled));
  }, [open, filtered, selectedValue]);
  useEffect(() => { if (open && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [open, active, listId]);
  useEffect(() => { if (open && hasSearch) { const frame = requestAnimationFrame(() => search.current?.focus({ preventScroll: true })); return () => cancelAnimationFrame(frame); } }, [open, hasSearch]);
  function choose(choice: Choice) {
    if (disabled || choice.disabled) return;
    setLocalValue(choice.value); setInvalid(false);
    onValueChange?.(choice.value); onChange?.(valueEvent<HTMLSelectElement>(choice.value, trigger.current));
    if (trigger.current) { trigger.current.value = choice.value; trigger.current.dispatchEvent(new Event('change', { bubbles: true })); }
    close(true);
  }
  function move(direction: number) {
    let index = active;
    for (let count = 0; count < filtered.length; count++) {
      index = (index + direction + filtered.length) % filtered.length;
      if (!filtered[index].disabled) { setActive(index); return; }
    }
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (disabled) return;
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      if (event.key === 'Home' || event.key === 'End') {
        const indices = filtered.flatMap((choice, index) => choice.disabled ? [] : [index]);
        setActive(event.key === 'Home' ? indices[0] ?? -1 : indices.at(-1) ?? -1);
      } else move(event.key === 'ArrowDown' ? 1 : -1);
    } else if ((event.key === 'Enter' || event.key === ' ') && event.target === trigger.current) {
      event.preventDefault(); if (!open) setOpen(true); else if (filtered[active]) choose(filtered[active]);
    } else if (event.key === 'Enter' && open) { event.preventDefault(); if (filtered[active]) choose(filtered[active]); }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.target === trigger.current) {
      event.preventDefault(); const current = performance.now();
      typeahead.current.value = current - typeahead.current.at > 700 ? event.key : typeahead.current.value + event.key;
      typeahead.current.at = current;
      const match = choices.find(choice => !choice.disabled && choice.text.toLowerCase().startsWith(typeahead.current.value.toLowerCase()));
      if (match) { if (open) setActive(filtered.findIndex(choice => choice.value === match.value)); else choose(match); }
    }
  }
  const { 'aria-label': ariaLabel, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, autoFocus, form, style, title, tabIndex, ...attributes } = rest;
  return <span className="form-select" data-open={open || undefined}>
    <button {...attributes as Record<string, unknown>} ref={trigger} id={id} type="button" role="combobox" value={selectedValue} data-control-value={selectedValue} aria-haspopup="listbox" aria-controls={open ? listId : undefined} aria-expanded={open} aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined} aria-required={required || undefined} aria-invalid={ariaInvalid || invalid || undefined} aria-label={ariaLabel} aria-labelledby={labelledBy} aria-describedby={describedBy} disabled={disabled} autoFocus={autoFocus} form={form} style={style} title={title} tabIndex={tabIndex} className={`form-select-trigger ${className}`} onClick={() => open ? close() : setOpen(true)} onFocus={event => onFocus?.(event as unknown as React.FocusEvent<HTMLSelectElement>)} onBlur={event => onBlur?.(event as unknown as React.FocusEvent<HTMLSelectElement>)} onKeyDown={event => { keyboard(event); onKeyDown?.(event as unknown as React.KeyboardEvent<HTMLSelectElement>); }}>
      <span className={`form-select-value${!selected ? ' is-placeholder' : ''}`}>{selected?.label ?? (selectedValue || placeholder)}</span><ControlIcon name="chevron-down" className="form-select-chevron" />
    </button>
    {(name || required) && <input ref={submission} className="control-form-value" type="text" value={selectedValue} name={name} form={form} required={required} disabled={disabled} tabIndex={-1} aria-hidden="true" autoComplete="off" onChange={() => {}} onInvalid={event => { event.preventDefault(); setInvalid(true); trigger.current?.focus(); }} />}
    {invalid && <span className="control-validation" role="alert">Choose an option.</span>}
    <FloatingPanel anchor={trigger} open={open} onDismiss={close} className="select-popover">
      {hasSearch && <div className="control-menu-search"><ControlIcon name="search" /><input ref={search} value={query} aria-label={ariaLabel ? `Search ${ariaLabel}` : 'Search options'} aria-controls={listId} aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined} placeholder="Find an option" onChange={event => setQuery(event.target.value)} onKeyDown={keyboard} autoComplete="off" spellCheck={false} /></div>}
      <div id={listId} role="listbox" aria-label={ariaLabel || selected?.text || 'Options'} aria-labelledby={labelledBy} className="control-options">
        {filtered.map((choice, index) => <Fragment key={`${choice.group ?? ''}:${choice.value}`}>
          {choice.group && (index === 0 || filtered[index - 1].group !== choice.group) && <div className="control-option-group" aria-hidden="true">{choice.group}</div>}
          <div id={`${listId}-${index}`} role="option" data-value={choice.value} aria-selected={selectedValue === choice.value} aria-disabled={choice.disabled || undefined} className={`control-option${active === index ? ' is-active' : ''}`} onPointerMove={() => { if (!choice.disabled) setActive(index); }} onMouseDown={event => event.preventDefault()} onClick={() => choose(choice)}><span>{choice.label}</span>{selectedValue === choice.value && <ControlIcon name="check" />}</div>
        </Fragment>)}
        {!filtered.length && <div className="control-no-options">No matching options</div>}
      </div>
    </FloatingPanel>
  </span>;
}
