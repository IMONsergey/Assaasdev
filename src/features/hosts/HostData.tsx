import { useEffect, useState } from 'react';
import { Button, Dialog, Icon } from '../../components/ui';
import { CodeCanvas } from '../../components/CodeCanvas';
import { dateLabel, safeExternalUrl } from '../search/model';
import { DataExplorer } from './DataExplorer';
import { displayValue } from './model';

export const observationDate = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? dateLabel(value) : displayValue(value);

export function DataValue({ value, depth = 0, path = 'data' }: { value: unknown; depth?: number; path?: string }) {
  if (value === undefined || value === null || value === '') return <span className="muted">{displayValue(value)}</span>;
  if (typeof value === 'boolean' || typeof value === 'number') return <>{displayValue(value)}</>;
  if (typeof value === 'string') {
    const url = safeExternalUrl(value);
    return url ? <a href={url} target="_blank" rel="noopener noreferrer nofollow">{value}<span className="host-sr-only"> (opens in a new tab)</span></a> : <span className="host-text-value">{value}</span>;
  }
  if (Array.isArray(value)) {
    if (!value.length) return <span className="muted">None returned</span>;
    if (value.length > 30) return <DataExplorer values={value} label={`${path.split('.').at(-1)!.replaceAll('_', ' ')} records`} stateId={path} renderValue={(child, index, column) => <DataValue value={child} depth={depth + 1} path={`${path}.${index}.${column}`} />} />;
    return <div className="host-data-array"><ul className="host-data-list">{value.map((child, index) => <li key={index}><DataValue value={child} depth={depth + 1} path={`${path}.${index}`} /></li>)}</ul></div>;
  }
  if (depth > 3) return <NestedRecord value={value} path={path} title="Nested record" />;
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > 30) return <DataExplorer values={entries} headers={['Field', 'Value']} label={`${path.split('.').at(-1)} fields`} stateId={path} renderValue={(child, index, column) => <DataValue value={child} depth={depth + 1} path={`${path}.${index}.${column}`} />} />;
    return <dl className="host-data-grid">{entries.map(([key, child]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd><DataValue value={child} depth={depth + 1} path={`${path}.${key}`} /></dd></div>)}</dl>;
  }
  return <>{String(value)}</>;
}

export function Facts({ values }: { values: [string, unknown][] }) {
  return <dl className="host-facts">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><DataValue value={value} path={label} /></dd></div>)}</dl>;
}

export function NestedRecord({ value, path, title }: { value: unknown; path: string; title: string }) {
  const [open, setOpen] = useState(false);
  const raw = path === 'host-record' || path === 'service-record';
  return <details className="host-disclosure" onToggle={event => setOpen(event.currentTarget.open)}><summary><span>{title}</span><Icon name="chevron-down" size={16} /></summary>{open && (raw ? <CodeCanvas content={JSON.stringify(value, null, 2) ?? 'null'} language="json" title={title} /> : <DataValue value={value} path={path} />)}</details>;
}

export function RawResponse({ title, content, onCopy }: { title: string; content: string | undefined; onCopy: (value: string) => void }) {
  const [fullOpen, setFullOpen] = useState(false);
  useEffect(() => { setFullOpen(false); }, [content]);
  return <section className="host-raw-response">
    <div className="host-section-heading"><h3>{title}</h3><Button variant="ghost" size="sm" disabled={content === undefined} onClick={() => setFullOpen(true)} aria-label={`Open full ${title}`}><Icon name="external" size={16} />Full response</Button></div>
    {content === undefined ? <div className="host-unavailable-inline">No {title.toLowerCase()} returned.</div> : <CodeCanvas content={content} title={title} onCopy={onCopy} codeClassName="host-banner" emptyLabel="Empty response" />}
    <Dialog open={fullOpen} onClose={() => setFullOpen(false)} title={title} size="lg" footer={<Button variant="secondary" onClick={() => { if (content !== undefined) onCopy(content); }}>Copy full text</Button>}>{fullOpen && <CodeCanvas content={content ?? ''} title={title} onCopy={onCopy} codeClassName="host-banner host-banner-full" emptyLabel="Empty response" />}</Dialog>
  </section>;
}
