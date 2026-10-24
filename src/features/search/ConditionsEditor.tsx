import { useEffect, useRef, useState } from 'react';
import type { RangeFilter, SearchRequest } from '../../api';
import { Alert, Button, ComboBoxField, Field, Icon, SelectField, TextArea } from '../../components/ui';
import { selectedType, validateSearchRequest, withType } from './model';
import { formatUtcSeconds, parseUtcSeconds } from './date-input';
import { ConditionBuilder } from './ConditionBuilder';

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
    requestAnimationFrame(() => { errorSummary.current?.focus({ preventScroll: true }); errorSummary.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); });
  }
  function apply() { try { onApply(validateSearchRequest(request)); } catch (cause) { showError(cause instanceof Error ? cause.message : 'Check your conditions.'); } }
  function boundary(value: string): string | number | undefined { return !value.trim() ? undefined : Number.isFinite(Number(value)) ? Number(value) : value; }
  function rangeChange(index: number, value: Partial<RangeFilter>) { patch({ range_filter: ranges.map((range, i) => i === index ? { ...range, ...value } : range) }); }
  function dateChange(index: number, key: 'start' | 'end', value: string) { try { rangeChange(index, { [key]: parseUtcSeconds(value) }); } catch (cause) { showError(cause instanceof Error ? cause.message : 'Check the date.'); } }
  const hasContent = Boolean(request.security_body || request.robots_body || request.exposed_data || request.min_size_mb !== undefined || request.max_size_mb !== undefined);

  return <section id="search-conditions" className="search-editor search-editor--drawer" aria-label="Conditions">
    <form id="search-conditions-form" onSubmit={event => { event.preventDefault(); apply(); }}>
      <div className="search-editor-fields">
        <div className="search-editor-basics"><Field label="Search text" value={request.full_text_search || ''} onChange={event => patch({ full_text_search: event.target.value })} placeholder="IP, domain or service" /><SelectField label="Result type" value={type} disabled={type === 'custom'} hint={type === 'custom' ? 'Edit type rules below.' : undefined} onChange={event => onChange(withType(request, event.target.value))}><option value="">All types</option><option value="ipv4">IPv4</option><option value="ipv6">IPv6</option><option value="domain">Domain</option>{type === 'custom' && <option value="custom">Custom type logic</option>}{type && !['ipv4', 'ipv6', 'domain', 'custom'].includes(type) && <option value={type}>{type}</option>}</SelectField></div>
        <div className="search-condition-section">
          <ConditionBuilder filters={filters} onChange={simple_search_filters => patch({ simple_search_filters })} />
        </div>
        <details className="search-advanced" open={ranges.length > 0 || undefined}>
          <summary><span><Icon name="calendar" size={17} />Dates & ranges</span>{ranges.length > 0 && <span className="search-section-count">{ranges.length}</span>}<Icon name="chevron-down" size={15} /></summary>
          <div className="search-advanced-content">{ranges.map((range, index) => {
            const start = formatUtcSeconds(range.start), end = formatUtcSeconds(range.end);
            const dateInput = ['uts', 'cts'].includes(range.field) && start !== null && end !== null;
            return <div key={index} className="search-range-row"><div className="search-range-field"><ComboBoxField label="Range field" value={range.field} displaySelectedLabel options={[{ value: 'uts', label: 'Last observed' }, { value: 'cts', label: 'First observed' }, { value: 'port', label: 'Port' }]} onValueChange={field => rangeChange(index, { field })} /><Button variant="ghost" size="sm" aria-label={`Remove ${range.field || 'empty'} range`} onClick={() => patch({ range_filter: ranges.filter((_, i) => i !== index) })}><Icon name="close" size={16} /></Button></div><div className="search-range-boundaries">{dateInput ? <><Field label="From · UTC" type="datetime-local" step="1" value={start} onChange={event => dateChange(index, 'start', event.target.value)} /><Field label="To · UTC" type="datetime-local" step="1" value={end} onChange={event => dateChange(index, 'end', event.target.value)} /></> : <><Field label="From" value={range.start ?? ''} onChange={event => rangeChange(index, { start: boundary(event.target.value) })} /><Field label="To" value={range.end ?? ''} onChange={event => rangeChange(index, { end: boundary(event.target.value) })} /></>}</div></div>;
          })}<Button variant="ghost" size="sm" onClick={() => patch({ range_filter: [...ranges, { field: 'uts' }] })}><Icon name="plus" size={15} />Add range</Button></div>
        </details>
        <details className="search-advanced" open={hasContent || undefined}><summary><span><Icon name="file" size={17} />Content & size</span><Icon name="chevron-down" size={15} /></summary><div className="search-advanced-content stack"><TextArea label="security.txt content" value={request.security_body || ''} rows={2} hint="Business" onChange={event => patch({ security_body: event.target.value })} /><TextArea label="robots.txt content" value={request.robots_body || ''} rows={2} onChange={event => patch({ robots_body: event.target.value })} /><Field label="Exposed data" value={request.exposed_data || ''} hint="Expert or Business" onChange={event => patch({ exposed_data: event.target.value })} /><div className="form-grid"><Field label="Minimum size · MB" type="number" min="0" step="any" value={request.min_size_mb ?? ''} onChange={event => patch({ min_size_mb: event.target.value === '' ? undefined : Number(event.target.value) })} /><Field label="Maximum size · MB" type="number" min="0" step="any" value={request.max_size_mb ?? ''} onChange={event => patch({ max_size_mb: event.target.value === '' ? undefined : Number(event.target.value) })} /></div></div></details>
        <details className="search-advanced" onToggle={event => { if (event.currentTarget.open) setJson(JSON.stringify(request, null, 2)); }}><summary><span><Icon name="code" size={17} />Query JSON</span><Icon name="chevron-down" size={15} /></summary><div className="search-advanced-content"><TextArea label="Search request" className="mono search-json-input" value={json} onChange={event => setJson(event.target.value)} rows={10} spellCheck={false} /><Button variant="secondary" size="sm" onClick={() => { try { onChange(validateSearchRequest(JSON.parse(json))); setError(''); } catch (cause) { showError(cause instanceof Error ? cause.message : 'Invalid search JSON.'); } }}>Use this JSON</Button></div></details>
      </div>
      {error && <div ref={errorSummary} className="search-condition-error" role="region" aria-label="Condition errors" tabIndex={-1}><Alert tone="error" title="Check your conditions">{error}</Alert></div>}
    </form>
  </section>;
}
