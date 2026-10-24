import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AutocompleteData, RangeFilter, SearchFilter, SearchRequest } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Button, Field, Icon, SelectField, TextArea } from '../../components/ui';
import { FIELD_NAMES, selectedType, validateSearchRequest, withType } from './model';
import { formatUtcSeconds, parseUtcSeconds } from './date-input';

const FIELD_GROUPS = [
  { label: 'Network', fields: [['ip', 'IP address'], ['domain', 'Domain'], ['org', 'Organization'], ['asn', 'ASN'], ['country_name', 'Country'], ['city_name', 'City'], ['os', 'Operating system']] },
  { label: 'Services', fields: [['port', 'Port'], ['protocol', 'Protocol'], ['transport', 'Transport'], ['status_code', 'HTTP status'], ['title', 'Page title'], ['tls_info.server_name', 'TLS server name']] },
  { label: 'Products & signals', fields: [['products', 'Product'], ['vendors', 'Vendor'], ['cve_id', 'CVE'], ['labels', 'Label']] },
];
const FIELD_LABELS = Object.fromEntries(FIELD_GROUPS.flatMap(group => group.fields));

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
  return <div className="search-suggestion-field"><Field label={label} value={value} placeholder={label === 'Field' ? 'Choose a field' : 'Enter a value'} onChange={event => onChange(event.target.value)} list={listId} autoComplete="off" disabled={disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} /><datalist id={listId}>{options.map(option => <option key={option} value={option} label={!field ? FIELD_LABELS[option] : undefined} />)}</datalist></div>;
}

function FilterEditor({ filter, onChange, onRemove, depth = 0 }: { filter: SearchFilter; onChange: (filter: SearchFilter) => void; onRemove: () => void; depth?: number }) {
  if (filter.operator) return <details open className={`search-condition-group ${depth > 1 ? 'search-condition-deep' : ''}`}>
    <summary><Icon name="chevron-down" size={14} /><span>{filter.operator === 'AND' ? 'All of these' : filter.operator === 'OR' ? 'Any of these' : 'Exclude these'}</span><span className="search-condition-group-count">{filter.filters?.length || 0}</span><code>{filter.operator}</code></summary>
    <div className="search-group-toolbar"><SelectField label="Match" value={filter.operator} onChange={event => onChange({ ...filter, operator: event.target.value as SearchFilter['operator'] })}><option value="AND">All · AND</option><option value="OR">Any · OR</option><option value="NOT">Exclude · NOT</option></SelectField><Button variant="ghost" size="sm" onClick={onRemove} aria-label="Remove condition group"><Icon name="trash" size={16} /></Button></div>
    <div className="search-condition-children">{(filter.filters || []).map((child, index) => <FilterEditor key={index} filter={child} depth={depth + 1} onRemove={() => onChange({ ...filter, filters: filter.filters!.filter((_, i) => i !== index) })} onChange={next => onChange({ ...filter, filters: filter.filters!.map((item, i) => i === index ? next : item) })} />)}</div>
    <div className="search-condition-add"><Button variant="ghost" size="sm" onClick={() => onChange({ ...filter, filters: [...(filter.filters || []), { field: '', value: '' }] })}><Icon name="plus" size={15} />Add condition</Button>{depth < 8 && <Button variant="ghost" size="sm" onClick={() => onChange({ ...filter, filters: [...(filter.filters || []), { operator: 'OR', filters: [{ field: '', value: '' }] }] })}>Add group</Button>}</div>
  </details>;
  return <div className="search-condition-leaf"><SuggestionField label="Field" value={filter.field || ''} onChange={field => onChange({ ...filter, field })} /><SuggestionField label="Value" field={filter.field} value={filter.value || ''} onChange={value => onChange({ ...filter, value })} /><Button variant="ghost" size="sm" className="search-remove-condition" onClick={onRemove} aria-label={`Remove ${filter.field || 'empty'} condition`}><Icon name="close" size={16} /></Button></div>;
}

export function ConditionsEditor({ request, onChange, onApply }: { request: SearchRequest; onChange: (request: SearchRequest) => void; onApply: (request: SearchRequest) => void }) {
  const [error, setError] = useState('');
  const errorSummary = useRef<HTMLDivElement>(null);
  const rangeListId = useId();
  const [json, setJson] = useState('');
  const filters = request.simple_search_filters || [];
  const ranges = request.range_filter || [];
  const type = selectedType(request);
  useEffect(() => { setError(''); }, [request]);
  function patch(value: Partial<SearchRequest>) { setError(''); onChange({ ...request, ...value }); }
  function showError(message: string) {
    setError(message);
    requestAnimationFrame(() => { errorSummary.current?.focus({ preventScroll: true }); errorSummary.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); });
  }
  function apply() { try { onApply(validateSearchRequest(request)); } catch (cause) { showError(cause instanceof Error ? cause.message : 'Check your conditions.'); } }
  function boundary(value: string): string | number | undefined { return !value.trim() ? undefined : Number.isFinite(Number(value)) ? Number(value) : value; }
  function rangeChange(index: number, value: Partial<RangeFilter>) { patch({ range_filter: ranges.map((range, i) => i === index ? { ...range, ...value } : range) }); }
  function dateChange(index: number, key: 'start' | 'end', value: string) { try { rangeChange(index, { [key]: parseUtcSeconds(value) }); } catch (cause) { showError(cause instanceof Error ? cause.message : 'Check the date.'); } }
  function addField(field = '') { patch({ simple_search_filters: [...filters, { field, value: '' }] }); }
  const hasContent = Boolean(request.security_body || request.robots_body || request.exposed_data || request.min_size_mb !== undefined || request.max_size_mb !== undefined);

  return <section id="search-conditions" className="search-editor search-editor--drawer" aria-label="Conditions">
    <form id="search-conditions-form" onSubmit={event => { event.preventDefault(); apply(); }}>
      <div className="search-editor-fields">
        <div className="search-editor-basics"><Field label="Search text" value={request.full_text_search || ''} onChange={event => patch({ full_text_search: event.target.value })} placeholder="IP, domain or service" /><SelectField label="Result type" value={type} disabled={type === 'custom'} hint={type === 'custom' ? 'Edit type rules below.' : undefined} onChange={event => onChange(withType(request, event.target.value))}><option value="">All types</option><option value="ipv4">IPv4</option><option value="ipv6">IPv6</option><option value="domain">Domain</option>{type === 'custom' && <option value="custom">Custom type logic</option>}{type && !['ipv4', 'ipv6', 'domain', 'custom'].includes(type) && <option value={type}>{type}</option>}</SelectField></div>
        <div className="search-condition-section">
          <div className="search-editor-section-heading"><h3 id="search-condition-title">Conditions</h3><span title="Every top-level condition must match. Use groups for alternatives or exclusions.">Match all</span></div>
          <div className="search-condition-list">{filters.map((filter, index) => <FilterEditor key={index} filter={filter} onChange={next => patch({ simple_search_filters: filters.map((item, i) => i === index ? next : item) })} onRemove={() => patch({ simple_search_filters: filters.filter((_, i) => i !== index) })} />)}</div>
          <div className="search-condition-add"><Button variant="ghost" size="sm" onClick={() => addField()}><Icon name="plus" size={15} />Add condition</Button><Button variant="ghost" size="sm" onClick={() => patch({ simple_search_filters: [...filters, { operator: 'OR', filters: [{ field: '', value: '' }] }] })}>Add group</Button></div>
          <label className="search-field-shortcut"><span className="search-sr-only">Add a field</span><select value="" onChange={event => { if (event.target.value) addField(event.target.value); }}><option value="">Choose a field by category…</option>{FIELD_GROUPS.map(group => <optgroup key={group.label} label={group.label}>{group.fields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</optgroup>)}</select><Icon name="chevron-down" size={15} /></label>
        </div>
        <details className="search-advanced" open={ranges.length > 0 || undefined}>
          <summary><span><Icon name="calendar" size={17} />Dates & ranges</span>{ranges.length > 0 && <span className="search-section-count">{ranges.length}</span>}<Icon name="chevron-down" size={15} /></summary>
          <div className="search-advanced-content">{ranges.map((range, index) => {
            const start = formatUtcSeconds(range.start), end = formatUtcSeconds(range.end);
            const dateInput = ['uts', 'cts'].includes(range.field) && start !== null && end !== null;
            return <div key={index} className="search-range-row"><div className="search-range-field"><Field label="Range field" list={rangeListId} value={range.field} onChange={event => rangeChange(index, { field: event.target.value })} /><Button variant="ghost" size="sm" aria-label={`Remove ${range.field || 'empty'} range`} onClick={() => patch({ range_filter: ranges.filter((_, i) => i !== index) })}><Icon name="close" size={16} /></Button></div><div className="search-range-boundaries">{dateInput ? <><Field label="From · UTC" type="datetime-local" step="1" value={start} onChange={event => dateChange(index, 'start', event.target.value)} /><Field label="To · UTC" type="datetime-local" step="1" value={end} onChange={event => dateChange(index, 'end', event.target.value)} /></> : <><Field label="From" value={range.start ?? ''} onChange={event => rangeChange(index, { start: boundary(event.target.value) })} /><Field label="To" value={range.end ?? ''} onChange={event => rangeChange(index, { end: boundary(event.target.value) })} /></>}</div></div>;
          })}<datalist id={rangeListId}><option value="uts" label="Last observed" /><option value="cts" label="First observed" /><option value="port" label="Port" /></datalist><Button variant="ghost" size="sm" onClick={() => patch({ range_filter: [...ranges, { field: 'uts' }] })}><Icon name="plus" size={15} />Add range</Button></div>
        </details>
        <details className="search-advanced" open={hasContent || undefined}><summary><span><Icon name="file" size={17} />Content & size</span><Icon name="chevron-down" size={15} /></summary><div className="search-advanced-content stack"><TextArea label="security.txt content" value={request.security_body || ''} rows={2} hint="Business" onChange={event => patch({ security_body: event.target.value })} /><TextArea label="robots.txt content" value={request.robots_body || ''} rows={2} onChange={event => patch({ robots_body: event.target.value })} /><Field label="Exposed data" value={request.exposed_data || ''} hint="Expert or Business" onChange={event => patch({ exposed_data: event.target.value })} /><div className="form-grid"><Field label="Minimum size · MB" type="number" min="0" value={request.min_size_mb ?? ''} onChange={event => patch({ min_size_mb: event.target.value === '' ? undefined : Number(event.target.value) })} /><Field label="Maximum size · MB" type="number" min="0" value={request.max_size_mb ?? ''} onChange={event => patch({ max_size_mb: event.target.value === '' ? undefined : Number(event.target.value) })} /></div></div></details>
        <details className="search-advanced" onToggle={event => { if (event.currentTarget.open) setJson(JSON.stringify(request, null, 2)); }}><summary><span><Icon name="code" size={17} />Query JSON</span><Icon name="chevron-down" size={15} /></summary><div className="search-advanced-content"><TextArea label="Search request" className="mono search-json-input" value={json} onChange={event => setJson(event.target.value)} rows={10} spellCheck={false} /><Button variant="secondary" size="sm" onClick={() => { try { onChange(validateSearchRequest(JSON.parse(json))); setError(''); } catch (cause) { showError(cause instanceof Error ? cause.message : 'Invalid search JSON.'); } }}>Use this JSON</Button></div></details>
      </div>
      {error && <div ref={errorSummary} className="search-condition-error" role="region" aria-label="Condition errors" tabIndex={-1}><Alert tone="error" title="Check your conditions">{error}</Alert></div>}
    </form>
  </section>;
}
