import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useApp } from '../../app/AppProvider';
import { Button, Checkbox, Field, Icon, Pagination } from '../../components/ui';
import { exploreRows, receivedTable } from './data-model';
import { useServiceViewScope } from './view-state';

interface ExplorerState { query: string; column: number | null; direction: 'asc' | 'desc'; page: number; size: number; hidden: number[] }
const initialView = (): ExplorerState => ({ query: '', column: null, direction: 'asc', page: 1, size: 50, hidden: [] });
// View settings only; no received records or credentials persist outside the response cache.
const views = new Map<string, ExplorerState>();
interface ExplorerProps { values: unknown[]; headers?: unknown[]; label: string; stateId: string; renderValue: (value: unknown, index: number, column: number) => ReactNode }

export function DataExplorer(props: ExplorerProps) {
  const location = useLocation(), { user, session } = useApp();
  const service = useServiceViewScope();
  const scope = JSON.stringify([user?.user_id || user?.session_id || session.status, location.pathname, service, props.stateId]);
  return <DataExplorerView key={scope} {...props} scope={scope} />;
}

function DataExplorerView({ values, headers, label, stateId, renderValue, scope }: ExplorerProps & { scope: string }) {
  const [view, setView] = useState<ExplorerState>(() => views.get(scope) || initialView());
  const table = useMemo(() => receivedTable(values, headers), [values, headers]);
  const column = view.column !== null && view.column < table.columns.length ? view.column : null;
  const matches = useMemo(() => exploreRows(table.rows, view.query, column, view.direction), [table.rows, view.query, column, view.direction]);
  const pages = Math.max(1, Math.ceil(matches.length / view.size)), page = Math.min(view.page, pages);
  const rows = matches.slice((page - 1) * view.size, page * view.size);
  const available = table.columns.map((title, index) => ({ title, index }));
  const visible = available.filter(item => !view.hidden.includes(item.index));
  const columns = visible.length ? visible : available.slice(0, 1);
  const update = (patch: Partial<ExplorerState>) => setView(previous => ({ ...previous, ...patch }));
  useEffect(() => { views.delete(scope); views.set(scope, view); if (views.size > 80) views.delete(views.keys().next().value!); }, [scope, view]);
  const sort = (index: number) => update({ column: index, direction: column === index && view.direction === 'asc' ? 'desc' : 'asc', page: 1 });
  return <div className="host-data-explorer" data-table-id={stateId}>
    <div className="host-data-controls">
      <Field label={`Search ${label}`} value={view.query} placeholder="Search all rows" icon={<Icon name="search" size={16} />} onChange={event => update({ query: event.target.value, page: 1 })} />
      <label className="host-data-select">Sort by<select value={column === null ? '' : String(column)} onChange={event => update({ column: event.target.value === '' ? null : Number(event.target.value), page: 1 })}><option value="">As received</option>{available.map(item => <option key={item.index} value={item.index}>{item.title}</option>)}</select></label>
      {column !== null && <Button variant="secondary" className="host-data-direction" aria-label={`Sort ${view.direction === 'asc' ? 'descending' : 'ascending'}`} onClick={() => update({ direction: view.direction === 'asc' ? 'desc' : 'asc', page: 1 })}>{view.direction === 'asc' ? '↑' : '↓'}<span>{view.direction === 'asc' ? 'Ascending' : 'Descending'}</span></Button>}
      <label className="host-data-select host-data-size">Rows<select value={view.size} onChange={event => update({ size: Number(event.target.value), page: 1 })}>{[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
    </div>
    <div className="host-data-toolbar"><p className="host-caption muted" role="status">{matches.length.toLocaleString()} {view.query ? `matching of ${table.rows.length.toLocaleString()} received rows` : 'received rows'}</p>{available.length > 1 && <details className="host-column-picker"><summary>Columns <span>{columns.length}/{available.length}</span><Icon name="chevron-down" size={14} /></summary><div>{available.map(item => <Checkbox key={item.index} label={item.title} checked={columns.some(visibleColumn => visibleColumn.index === item.index)} disabled={columns.length === 1 && columns[0].index === item.index} onChange={event => update({ hidden: event.target.checked ? view.hidden.filter(index => index !== item.index) : [...view.hidden, item.index] })} />)}{view.hidden.length > 0 && <Button variant="ghost" size="sm" onClick={() => update({ hidden: [] })}>Show all columns</Button>}</div></details>}</div>
    <div className="table-wrap host-data-table-wrap" role="region" aria-label={label} tabIndex={0}><table className="data-table"><thead><tr>{columns.map(item => <th key={item.index} aria-sort={column === item.index ? view.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => sort(item.index)} title={`Sort by ${item.title}`}>{item.title}<span aria-hidden="true">{column === item.index ? view.direction === 'asc' ? '↑' : '↓' : '↕'}</span></button></th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.index}>{columns.map(item => <td key={item.index}>{renderValue(row.cells[item.index], row.index, item.index)}</td>)}</tr>)}</tbody></table></div>
    {!matches.length && <div className="host-data-empty"><p>{view.query ? 'No received rows match this search.' : 'No rows were returned.'}</p>{view.query && <Button variant="secondary" size="sm" onClick={() => update({ query: '', page: 1 })}>Clear row search</Button>}</div>}
    {matches.length > view.size && <Pagination page={page} pageSize={view.size} count={rows.length} total={matches.length} onPageChange={next => update({ page: next })} />}
  </div>;
}
