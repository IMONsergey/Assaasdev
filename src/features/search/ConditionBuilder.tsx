import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AutocompleteData, SearchFilter } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Button, ComboBoxField, Icon, SelectControl } from '../../components/ui';
import { FIELD_NAMES } from './model';
import './condition-builder.css';

export const CONDITION_FIELDS = [
  { label: 'Network', fields: [['ip', 'IP address'], ['domain', 'Domain'], ['org', 'Organization'], ['asn', 'ASN'], ['country_name', 'Country'], ['country_code', 'Country code'], ['city_name', 'City'], ['os', 'Operating system']] },
  { label: 'Services', fields: [['port', 'Port'], ['protocol', 'Protocol'], ['transport', 'Transport'], ['status_code', 'HTTP status'], ['title', 'Page title'], ['tls_info.server_name', 'TLS server name']] },
  { label: 'Products & signals', fields: [['products', 'Product'], ['vendors', 'Vendor'], ['cve_id', 'CVE'], ['labels', 'Label']] },
];
const fieldLabels = Object.fromEntries(CONDITION_FIELDS.flatMap(group => group.fields));
const operators = [{ value: 'AND', label: 'All' }, { value: 'OR', label: 'Any' }, { value: 'NOT', label: 'Exclude' }] as const;
const groupLabel = (filter: SearchFilter) => filter.operator === 'AND' ? 'All conditions' : filter.operator === 'NOT' ? 'Excluded conditions' : 'Any condition';

export function SuggestionField({ label, value, field, onChange, disabled }: { label: string; value: string; field?: string; onChange: (value: string) => void; disabled?: boolean }) {
  const { api, session } = useApp();
  const isField = label === 'Field';
  const [focused, setFocused] = useState(false), [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), 220); return () => clearTimeout(timer); }, [value]);
  const suggestions = useQuery({ queryKey: ['autocomplete', field || '', debounced], enabled: focused && !disabled && (isField || Boolean(field)) && (session.status === 'guest' || session.status === 'authenticated'), queryFn: async ({ signal }) => {
    const frame = await api.request<AutocompleteData>('autocomplete', { query: debounced.trim() || '*', ...(field ? { field } : {}) }, { signal });
    return frame.data;
  }, staleTime: 60_000 });
  const options = !isField ? (suggestions.data?.results || []) : [
    ...CONDITION_FIELDS.flatMap(group => group.fields.map(([value, label]) => ({ value, label, group: group.label }))),
    ...[...new Set([...FIELD_NAMES, ...(suggestions.data?.results || [])])].filter(name => !fieldLabels[name]).map(value => ({ value, label: value, group: 'Other fields' })),
  ];
  return <div className="search-suggestion-field"><ComboBoxField label={label} value={value} options={options} displaySelectedLabel={isField} allowCustom placeholder={isField ? 'Choose a field' : 'Enter a value'} onValueChange={onChange} autoComplete="off" spellCheck={false} disabled={disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} /></div>;
}

/** The editor changes one group at a time, without flattening its boolean tree. */
function groupAt(filters: SearchFilter[], path: number[]): SearchFilter {
  let group: SearchFilter = { operator: 'AND', filters };
  for (const index of path) {
    const next = group.filters?.[index];
    if (!next?.operator) return group;
    group = next;
  }
  return group;
}
function validPath(filters: SearchFilter[], path: number[]): number[] {
  const valid: number[] = [];
  let children = filters;
  for (const index of path) {
    const next = children[index];
    if (!next?.operator) break;
    valid.push(index); children = next.filters || [];
  }
  return valid;
}
function editGroup(filters: SearchFilter[], path: number[], update: (group: SearchFilter) => SearchFilter): SearchFilter[] {
  if (!path.length) return update({ operator: 'AND', filters }).filters || [];
  const [index, ...rest] = path;
  return filters.map((filter, i) => i !== index || !filter.operator ? filter : rest.length ? { ...filter, filters: editGroup(filter.filters || [], rest, update) } : update(filter));
}
function preview(filter: SearchFilter): string {
  if (filter.operator) return `${groupLabel(filter)} · ${filter.filters?.length || 0}`;
  return `${fieldLabels[filter.field || ''] || filter.field || 'New condition'}${filter.value ? `: ${filter.value}` : ''}`;
}

export function ConditionBuilder({ filters, onChange }: { filters: SearchFilter[]; onChange: (filters: SearchFilter[]) => void }) {
  const [path, setPath] = useState<number[]>([]);
  const heading = useRef<HTMLDivElement>(null);
  const currentPath = validPath(filters, path), group = groupAt(filters, currentPath), children = group.filters || [];
  const pathKey = currentPath.join('.');
  useEffect(() => { if (pathKey !== path.join('.')) setPath(currentPath); }, [pathKey, path]);
  function navigate(next: number[]) { setPath(next); requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); }
  function patch(update: (group: SearchFilter) => SearchFilter) { onChange(editGroup(filters, currentPath, update)); }
  function replaceChildren(next: SearchFilter[]) { patch(group => ({ ...group, filters: next })); }
  function addCondition(field = '') { replaceChildren([...children, { field, value: '' }]); }
  function addGroup() {
    const nextIndex = children.length;
    replaceChildren([...children, { operator: 'OR', filters: [{ field: '', value: '' }] }]);
    navigate([...currentPath, nextIndex]);
  }
  function removeCurrentGroup() {
    const parent = currentPath.slice(0, -1), index = currentPath.at(-1);
    onChange(editGroup(filters, parent, group => ({ ...group, filters: (group.filters || []).filter((_, i) => i !== index) })));
    navigate(parent);
  }
  return <div className="condition-builder">
    <div className="condition-builder-heading" ref={heading} tabIndex={-1}>
      <nav className="condition-breadcrumbs" aria-label="Condition groups">
        <button type="button" aria-current={!currentPath.length ? 'location' : undefined} onClick={() => navigate([])}>All conditions</button>
        {currentPath.map((_, i) => <span key={currentPath.slice(0, i + 1).join('.')}><Icon name="chevron-right" size={13} /><button type="button" aria-current={i === currentPath.length - 1 ? 'location' : undefined} onClick={() => navigate(currentPath.slice(0, i + 1))}>{groupLabel(groupAt(filters, currentPath.slice(0, i + 1)))}</button></span>)}
      </nav>
      <span className="condition-total" aria-live="polite">{children.length}</span>
    </div>
    {currentPath.length > 0 && <div className="condition-group-controls">
      <div className="condition-match" role="radiogroup" aria-label="Conditions match" onKeyDown={event => {
        const current = operators.findIndex(item => item.value === group.operator);
        const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (current + 1) % operators.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (current + operators.length - 1) % operators.length : event.key === 'Home' ? 0 : event.key === 'End' ? operators.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); patch(group => ({ ...group, operator: operators[next].value })); (event.currentTarget.children[next] as HTMLButtonElement).focus(); }
      }}>{operators.map(item => <button key={item.value} type="button" role="radio" aria-checked={group.operator === item.value} tabIndex={group.operator === item.value ? 0 : -1} onClick={() => patch(group => ({ ...group, operator: item.value }))}>{item.label}</button>)}</div>
      <Button variant="ghost" className="condition-remove-group" aria-label="Remove current condition group" onClick={removeCurrentGroup}><Icon name="trash" size={16} /></Button>
    </div>}
    <div key={pathKey} className="condition-view search-condition-list" data-condition-depth={currentPath.length}>
      {children.map((filter, index) => <div className="condition-item" key={index}>
        {index > 0 && <span className="condition-connector" aria-hidden="true">{group.operator === 'OR' ? 'or' : group.operator === 'NOT' ? 'and not' : 'and'}</span>}
        {filter.operator ? <div className="condition-group-card">
          <button type="button" className="condition-group-open" aria-label={`Edit ${groupLabel(filter).toLowerCase()}, ${filter.filters?.length || 0} conditions`} onClick={() => navigate([...currentPath, index])}>
            <span className="condition-group-symbol"><Icon name="folder" size={18} /></span>
            <span className="condition-group-copy"><strong>{groupLabel(filter)}<span>{filter.filters?.length || 0}</span></strong><small>{(filter.filters || []).slice(0, 2).map(preview).join(' · ')}{(filter.filters?.length || 0) > 2 ? ` · +${filter.filters!.length - 2}` : ''}</small></span>
            <Icon name="chevron-right" size={16} />
          </button>
          <Button variant="ghost" className="condition-remove" aria-label={`Remove condition group ${index + 1}`} onClick={() => replaceChildren(children.filter((_, i) => i !== index))}><Icon name="close" size={16} /></Button>
        </div> : <div className="condition-rule" role="group" aria-label={`Condition ${index + 1}`}>
          <SuggestionField label="Field" value={filter.field || ''} onChange={field => replaceChildren(children.map((item, i) => i === index ? { ...filter, field } : item))} />
          <SuggestionField label="Value" field={filter.field || undefined} value={filter.value || ''} onChange={value => replaceChildren(children.map((item, i) => i === index ? { ...filter, value } : item))} />
          <Button variant="ghost" className="condition-remove" aria-label={`Remove ${filter.field || 'empty'} condition`} onClick={() => replaceChildren(children.filter((_, i) => i !== index))}><Icon name="close" size={16} /></Button>
        </div>}
      </div>)}
    </div>
    {children.length === 0 && <div className="condition-quick-fields">{[['country_name', 'Country', 'globe'], ['port', 'Port', 'server'], ['products', 'Product', 'package'], ['status_code', 'HTTP status', 'code']].map(([field, label, icon]) => <button type="button" key={field} onClick={() => addCondition(field)}><Icon name={icon} size={16} />{label}<Icon name="plus" size={14} /></button>)}</div>}
    <div className="condition-add-actions">
      <Button variant="secondary" size="sm" onClick={() => addCondition()}><Icon name="plus" size={15} />Add condition</Button>
      {currentPath.length < 19 && <Button variant="ghost" size="sm" onClick={addGroup}><Icon name="folder" size={15} />Add group</Button>}
    </div>
    <SelectControl className="condition-field-shortcut" aria-label="Add a field" value="" onChange={event => { if (event.target.value) addCondition(event.target.value); }}><option value="">Browse all fields</option>{CONDITION_FIELDS.map(group => <optgroup key={group.label} label={group.label}>{group.fields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</optgroup>)}</SelectControl>
  </div>;
}
