import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AutocompleteData, RangeFilter, SearchFilter, SearchRequest } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Button, Field, SelectField, TextArea } from '../../components/ui';
import { FIELD_NAMES, selectedType, validateSearchRequest, withType } from './model';

function SuggestionField({ label, value, field, onChange, disabled }: { label: string; value: string; field?: string; onChange: (value: string) => void; disabled?: boolean }) {
  const { api, session } = useApp();
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), 250); return () => clearTimeout(timer); }, [value]);
  const suggestions = useQuery({ queryKey: ['autocomplete', field || '', debounced], enabled: focused && !disabled && (session.status === 'guest' || session.status === 'authenticated'), queryFn: async ({ signal }) => {
    const frame = await api.request<AutocompleteData>('autocomplete', { query: debounced.trim() || '*', ...(field ? { field } : {}) }, { signal });
    return frame.data;
  }, staleTime: 60_000 });
  const options = suggestions.data?.results || (field ? [] : FIELD_NAMES.filter(name => name.includes(value.toLowerCase())));
  return <div className="search-suggestion-field"><Field label={label} value={value} onChange={event => onChange(event.target.value)} list={listId} autoComplete="off" disabled={disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} /><datalist id={listId}>{options.map(option => <option key={option} value={option} />)}</datalist>{focused && suggestions.data?.has_more && <small className="muted">Up to 10 suggestions. Keep typing to narrow them.</small>}</div>;
}

function FilterEditor({ filter, onChange, onRemove, depth = 0 }: { filter: SearchFilter; onChange: (filter: SearchFilter) => void; onRemove: () => void; depth?: number }) {
  if (filter.operator) return <fieldset className={`search-condition-group ${depth > 1 ? 'search-condition-deep' : ''}`}><legend>Condition group</legend><div className="search-group-toolbar"><SelectField label="Match" value={filter.operator} onChange={event => onChange({ ...filter, operator: event.target.value as SearchFilter['operator'] })}><option value="AND">AND · Match every condition</option><option value="OR">OR · Match any condition</option><option value="NOT">NOT · Exclude matching conditions</option></SelectField><Button variant="ghost" size="sm" onClick={onRemove} aria-label="Remove condition group">Remove group</Button></div><div className="search-condition-children">{(filter.filters || []).map((child, index) => <FilterEditor key={index} filter={child} depth={depth + 1} onRemove={() => onChange({ ...filter, filters: filter.filters!.filter((_, i) => i !== index) })} onChange={next => onChange({ ...filter, filters: filter.filters!.map((item, i) => i === index ? next : item) })} />)}</div><div className="cluster"><Button variant="secondary" size="sm" onClick={() => onChange({ ...filter, filters: [...(filter.filters || []), { field: '', value: '' }] })}>Add condition</Button>{depth < 8 && <Button variant="ghost" size="sm" onClick={() => onChange({ ...filter, filters: [...(filter.filters || []), { operator: 'OR', filters: [{ field: '', value: '' }] }] })}>Add group</Button>}</div></fieldset>;
  return <div className="search-condition-leaf"><SuggestionField label="Field" value={filter.field || ''} onChange={field => onChange({ ...filter, field })} /><SuggestionField label="Value" field={filter.field} value={filter.value || ''} onChange={value => onChange({ ...filter, value })} /><Button variant="ghost" size="sm" className="search-remove-condition" onClick={onRemove} aria-label={`Remove ${filter.field || 'empty'} condition`}>Remove</Button></div>;
}

export function ConditionsEditor({ request, onChange, onApply }: { request: SearchRequest; onChange: (request: SearchRequest) => void; onApply: (request: SearchRequest) => void }) {
  const [error, setError] = useState('');
  const errorSummary = useRef<HTMLDivElement>(null);
  const [json, setJson] = useState('');
  const filters = request.simple_search_filters || [];
  const ranges = request.range_filter || [];
  const type = selectedType(request);
  useEffect(() => { setError(''); }, [request]);
  function patch(value: Partial<SearchRequest>) { setError(''); onChange({ ...request, ...value }); }
  function showError(message: string) {
    setError(message);
    requestAnimationFrame(() => {
      errorSummary.current?.focus({ preventScroll: true });
      errorSummary.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
  }
  function apply() { try { onApply(validateSearchRequest(request)); } catch (cause) { showError(cause instanceof Error ? cause.message : 'Check the highlighted conditions.'); } }
  function boundary(value: string): string | number | undefined { return !value.trim() ? undefined : Number.isFinite(Number(value)) ? Number(value) : value; }
  function rangeChange(index: number, value: Partial<RangeFilter>) { patch({ range_filter: ranges.map((range, i) => i === index ? { ...range, ...value } : range) }); }
  return <section id="search-conditions" className="search-editor search-editor--drawer" aria-label="Conditions">
    <form id="search-conditions-form" onSubmit={event => { event.preventDefault(); apply(); }}>
      <div className="search-editor-intro"><p>Refine your search. Results stay unchanged until you apply.</p><span className="search-draft-label">Draft</span></div>
      <div className="search-editor-fields">
        <Field label="Search text" value={request.full_text_search || ''} onChange={event => patch({ full_text_search: event.target.value })} placeholder="Domain, IP or technical attribute" />
        <SelectField label="Result type" value={type} disabled={type === 'custom'} hint={type === 'custom' ? 'Combined or excluded types are controlled by the rules below.' : undefined} onChange={event => onChange(withType(request, event.target.value))}>
          <option value="">All Types</option><option value="ipv4">IPv4</option><option value="ipv6">IPv6</option><option value="domain">Domain</option>
          {type === 'custom' && <option value="custom">Custom type logic</option>}
          {type && !['ipv4', 'ipv6', 'domain', 'custom'].includes(type) && <option value={type}>{type}</option>}
        </SelectField>
        <div className="search-editor-section-heading"><h3>Structured conditions</h3><p>All top-level rules must match. Use groups for alternatives or exclusions.</p></div>
        {filters.map((filter, index) => <FilterEditor key={index} filter={filter} onChange={next => patch({ simple_search_filters: filters.map((item, i) => i === index ? next : item) })} onRemove={() => patch({ simple_search_filters: filters.filter((_, i) => i !== index) })} />)}
        <div className="cluster"><Button variant="secondary" onClick={() => patch({ simple_search_filters: [...filters, { field: '', value: '' }] })}>Add condition</Button><Button variant="ghost" onClick={() => patch({ simple_search_filters: [...filters, { operator: 'OR', filters: [{ field: '', value: '' }] }] })}>Add AND / OR / NOT group</Button></div>
        <details className="search-advanced" open={ranges.length > 0 || undefined}>
          <summary>Ranges and observation dates</summary><p className="muted">A range accepts a number or text. Observation dates use Unix seconds.</p>
          {ranges.map((range, index) => <div key={index} className="search-range-row"><Field label="Range field" list="search-range-fields" value={range.field} onChange={event => rangeChange(index, { field: event.target.value })} /><Field label="From" value={range.start ?? ''} onChange={event => rangeChange(index, { start: boundary(event.target.value) })} /><Field label="To" value={range.end ?? ''} onChange={event => rangeChange(index, { end: boundary(event.target.value) })} /><Button variant="ghost" size="sm" onClick={() => patch({ range_filter: ranges.filter((_, i) => i !== index) })}>Remove</Button></div>)}
          <datalist id="search-range-fields"><option value="uts" /><option value="cts" /><option value="port" /></datalist><Button variant="secondary" size="sm" onClick={() => patch({ range_filter: [...ranges, { field: 'uts' }] })}>Add range</Button>
        </details>
        <details className="search-advanced"><summary>Content and size</summary><div className="stack"><TextArea label="security.txt content" value={request.security_body || ''} hint="Requires Business." onChange={event => patch({ security_body: event.target.value })} /><TextArea label="robots.txt content" value={request.robots_body || ''} onChange={event => patch({ robots_body: event.target.value })} /><Field label="Exposed data" value={request.exposed_data || ''} hint="Requires Expert or Business." onChange={event => patch({ exposed_data: event.target.value })} /><div className="form-grid"><Field label="Minimum size · MB" type="number" min="0" value={request.min_size_mb ?? ''} onChange={event => patch({ min_size_mb: event.target.value === '' ? undefined : Number(event.target.value) })} /><Field label="Maximum size · MB" type="number" min="0" value={request.max_size_mb ?? ''} onChange={event => patch({ max_size_mb: event.target.value === '' ? undefined : Number(event.target.value) })} /></div></div></details>
        <details className="search-advanced" onToggle={event => { if (event.currentTarget.open) setJson(JSON.stringify(request, null, 2)); }}><summary>Complete query JSON</summary><TextArea label="Search request" className="mono search-json-input" value={json} onChange={event => setJson(event.target.value)} rows={10} spellCheck={false} /><Button variant="secondary" onClick={() => { try { onChange(validateSearchRequest(JSON.parse(json))); setError(''); } catch (cause) { showError(cause instanceof Error ? cause.message : 'Invalid search JSON.'); } }}>Use this JSON</Button></details>
      </div>
      {error && <div ref={errorSummary} className="search-condition-error" role="region" aria-label="Condition errors" tabIndex={-1}><Alert tone="error" title="Check your conditions">{error}</Alert></div>}
    </form>
  </section>;
}
