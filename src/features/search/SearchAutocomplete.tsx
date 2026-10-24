import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AutocompleteData } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Icon } from '../../components/ui';
import { TechnologyMark, ProtocolMark } from '../../components/TechnologyMark';
import { CountryFlag } from '../../components/CountryFlag';

const fields = [
  { key: 'ip', label: 'IP address', icon: 'server' },
  { key: 'domain', label: 'Domain', icon: 'globe' },
  { key: 'country_name', label: 'Country', icon: 'globe' },
  { key: 'org', label: 'Organization', icon: 'users' },
  { key: 'asn', label: 'ASN', icon: 'database' },
  { key: 'port', label: 'Port', icon: 'server' },
  { key: 'protocol', label: 'Protocol', icon: 'code' },
  { key: 'products', label: 'Product', icon: 'package' },
  { key: 'vendors', label: 'Vendor', icon: 'package' },
  { key: 'cve_id', label: 'CVE', icon: 'shield' },
  { key: 'title', label: 'Page title', icon: 'file' },
];
type Suggestion = { id: string; label: string; detail: string; icon: string; field?: string; value?: string };

function SuggestionMark({ option }: { option: Suggestion }) {
  if (!option.value) return <Icon name={option.icon} size={18} />;
  if (option.field === 'country_name') return <CountryFlag name={option.value} />;
  if (option.field === 'country_code') return <CountryFlag code={option.value} />;
  if (option.field === 'products' || option.field === 'vendors') return <TechnologyMark name={option.value} size={18} />;
  if (option.field === 'org') return <TechnologyMark name={option.value} kind="provider" size={18} />;
  if (option.field === 'protocol') return <ProtocolMark protocol={option.value} size={18} />;
  return <Icon name={option.icon} size={18} />;
}

/** Field/value completions use the documented autocomplete method, never hosts. */
export function SearchAutocomplete({ value, onChange, onSearch, onFilter, readOnly, invalid, describedBy }: {
  value: string;
  onChange: (value: string) => void;
  onSearch: (value: string) => void;
  onFilter: (field: string, value: string) => void;
  readOnly?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { api, user, session } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const [debounced, setDebounced] = useState(value.trim());
  const [placement, setPlacement] = useState({ above: false, height: 360 });
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value.trim()), 220); return () => clearTimeout(timer); }, [value]);
  const principal = user?.user_id || user?.session_id || session.status;
  const hasAccess = session.status === 'authenticated' || session.status === 'guest';
  const visible = focused && !dismissed && !readOnly && value.trim().length > 0;
  useLayoutEffect(() => {
    if (!visible) return;
    const sync = () => {
      const box = root.current?.closest('form')?.getBoundingClientRect();
      if (!box) return;
      const viewport = window.visualViewport;
      const bottom = (viewport ? viewport.height + viewport.offsetTop : window.innerHeight) - box.bottom - 16;
      const top = box.top - (viewport?.offsetTop || 0) - 16;
      const above = bottom < 220 && top > bottom;
      setPlacement({ above, height: Math.max(120, Math.min(420, above ? top : bottom)) });
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, { passive: true });
    window.visualViewport?.addEventListener('resize', sync);
    return () => { window.removeEventListener('resize', sync); window.removeEventListener('scroll', sync); window.visualViewport?.removeEventListener('resize', sync); };
  }, [visible]);
  const results = useQuery({
    queryKey: ['search-input-completions', principal, debounced],
    enabled: visible && hasAccess && debounced.length >= 2 && debounced.length <= 120 && debounced === value.trim(),
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const sourceFields = /^[\d.]+$/.test(debounced) ? ['ip', 'port'] : debounced.includes('.') ? ['domain', 'products'] : ['domain', 'products', 'country_name'];
      const answers = await Promise.allSettled(sourceFields.map(async field => {
        const frame = await api.request<AutocompleteData>('autocomplete', { field, query: debounced }, { signal });
        const values = Array.isArray(frame.data?.results) ? frame.data.results.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length < 500) : [];
        return values.slice(0, 5).map(item => ({ field, value: item }));
      }));
      if (answers.every(answer => answer.status === 'rejected')) throw new Error('Suggestions unavailable');
      return answers.flatMap(answer => answer.status === 'fulfilled' ? answer.value : []);
    },
  });
  const suggestions = useMemo<Suggestion[]>(() => {
    const input = value.trim();
    if (!input) return [];
    const filterOptions = fields.filter(field => `${field.key} ${field.label}`.toLowerCase().includes(input.toLowerCase())).slice(0, 3)
      .map(field => ({ id: `field-${field.key}`, label: field.label, detail: 'Add a filter', icon: field.icon, field: field.key, value: '' }));
    const values = (debounced === input ? results.data || [] : []).map(option => {
      const field = fields.find(item => item.key === option.field);
      return { id: `${option.field}-${option.value}`, label: option.value, detail: `${field?.label || option.field} filter`, icon: field?.icon || 'filter', field: option.field, value: option.value };
    });
    return [{ id: 'search', label: input, detail: 'Search all text', icon: 'search' }, ...filterOptions, ...values].filter((option, index, list) => list.findIndex(item => item.id === option.id) === index).slice(0, 8);
  }, [value, debounced, results.data]);
  useEffect(() => { setActive(-1); }, [value]);
  useEffect(() => { if (active >= suggestions.length) setActive(-1); }, [active, suggestions.length]);
  useEffect(() => { if (visible && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }, [active, visible, listId]);
  function choose(option: Suggestion) {
    setDismissed(true); setActive(-1);
    if (option.field) onFilter(option.field, option.value || ''); else onSearch(value);
  }
  return <div ref={root} className="search-autocomplete">
    <label className="search-sr-only" htmlFor="main-search-query">Search internet infrastructure</label>
    <input id="main-search-query" role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={visible ? listId : undefined} aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined} aria-invalid={invalid || undefined} aria-describedby={describedBy} value={value} onChange={event => { setDismissed(false); onChange(event.target.value); }} onFocus={() => { setFocused(true); setDismissed(false); }} onBlur={() => { setFocused(false); setActive(-1); }} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape') { if (visible) event.preventDefault(); setDismissed(true); setActive(-1); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { if (!value.trim()) return; event.preventDefault(); setDismissed(false); setActive(current => event.key === 'ArrowDown' ? (current + 1) % suggestions.length : (current <= 0 ? suggestions.length - 1 : current - 1)); }
      else if (event.key === 'Enter') { if (visible && active >= 0 && suggestions[active]) { event.preventDefault(); choose(suggestions[active]); } else { setDismissed(true); setActive(-1); } }
      else if (event.key === 'Tab') { setDismissed(true); setActive(-1); }
    }} placeholder="Search an IP, domain or service" readOnly={readOnly} spellCheck={false} autoComplete="off" />
    {visible && <div className={`search-suggestions${placement.above ? ' is-above' : ''}`} style={{ '--suggestions-height': `${placement.height}px` } as CSSProperties}>
      <div id={listId} role="listbox" aria-label="Search suggestions">{suggestions.map((option, index) => <div key={option.id} id={`${listId}-${index}`} role="option" aria-selected={active === index} className="search-suggestion" onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}><span className="search-suggestion-icon"><SuggestionMark option={option} /></span><span className="search-suggestion-copy"><strong>{option.label}</strong><small>{option.detail}</small></span><Icon name={option.field ? 'plus' : 'arrow'} size={16} /></div>)}</div>
      <div className="search-suggestions-footer"><span>{results.isError ? 'Suggestions unavailable. You can still run your search.' : results.isFetching ? 'Finding matching values…' : 'Choose a suggestion or continue typing'}</span><span className="search-suggestion-keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>Enter</kbd></span></div>
    </div>}
  </div>;
}
