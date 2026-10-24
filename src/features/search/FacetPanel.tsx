import { useId, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError, isApiError } from '../../api';
import type { AnalyticsFacet, FacetData } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Button, Checkbox, Dialog, Field, Icon, Spinner } from '../../components/ui';
import { FACET_NAMES, facetTitle, facetUnit } from './model';

const FACET_PAGE_SIZE = 50;

function FacetValues({ facet, selected, disabled, shared, onSelect }: { facet: FacetData; selected: string[]; disabled: boolean; shared: boolean; onSelect: (field: string, value: string) => void }) {
  const headingId = useId();
  const title = facetTitle(facet.facet_name);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const selection = new Set(selected);
  const values = useMemo(() => {
    const unique = new Map<string, { key: string; count: number | null }>();
    for (const value of Array.isArray(facet.facet_values) ? facet.facet_values : []) {
      if (!value || (typeof value.key !== 'string' && typeof value.key !== 'number')) continue;
      const key = String(value.key);
      if (!unique.has(key)) unique.set(key, { key, count: typeof value.doc_count === 'number' && Number.isFinite(value.doc_count) && value.doc_count >= 0 ? value.doc_count : null });
    }
    // Applied values can disappear from the next analytics response. They must
    // still be removable, without inventing a count the server did not return.
    for (const key of selected) if (!unique.has(key)) unique.set(key, { key, count: null });
    return [...unique.values()];
  }, [facet.facet_values, selected]);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = values.filter(value => (!selectedOnly || selection.has(value.key)) && (!needle || value.key.toLocaleLowerCase().includes(needle)));
  const browsing = expanded || Boolean(needle) || selectedOnly;
  const pageSize = browsing ? FACET_PAGE_SIZE : 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const shown = filtered.slice(start, start + pageSize);
  const max = values.reduce((highest, value) => Math.max(highest, value.count || 0), 0);
  return <section className="search-facet" aria-labelledby={headingId}>
    <h3 id={headingId}>{title} <span>· {facetUnit(facet.facet_name)}</span></h3>
    {(values.length > 10 || query) && <Field className="search-facet-search" type="search" label={`Search ${title.toLowerCase()} values`} value={query} placeholder={`Find in ${values.length.toLocaleString()} values`} onChange={event => { setQuery(event.target.value); setPage(1); setExpanded(true); }} />}
    {selected.length > 0 && <button type="button" className="search-facet-selection" aria-pressed={selectedOnly} onClick={() => { setSelectedOnly(!selectedOnly); setPage(1); }}>Selected ({selected.length.toLocaleString()})</button>}
    <div className="search-facet-values">
      {shown.map(value => <div key={value.key} className="search-facet-item">
        <button type="button" disabled={disabled} aria-pressed={selection.has(value.key)} title={shared ? 'This shared search is fixed. Start your own search to change it.' : `${selection.has(value.key) ? 'Remove' : 'Add'} ${value.key} filter`} onClick={() => onSelect(facet.facet_name, value.key)}><span>{selection.has(value.key) && <Icon name="check" size={13} />}{value.key}</span><strong title={value.count === null ? 'Count not returned' : undefined}>{value.count === null ? '—' : value.count.toLocaleString()}</strong></button>
        <div className="search-facet-track" aria-hidden="true"><span style={{ width: `${max && value.count !== null ? value.count / max * 100 : 0}%` }} /></div>
      </div>)}
    </div>
    {!filtered.length && <p className="search-facet-empty">No matching values in this result.</p>}
    {!browsing && filtered.length > 10 && <Button className="search-facet-browse" variant="ghost" size="sm" onClick={() => { setExpanded(true); setPage(1); }}>Browse all {filtered.length.toLocaleString()} values</Button>}
    {browsing && <div className="search-facet-pagination">
      <p role="status">{filtered.length ? `${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length.toLocaleString()}` : '0 values'}</p>
      {pageCount > 1 && <nav aria-label={`${title} value pages`}><Button variant="ghost" size="sm" disabled={currentPage === 1} aria-label={`Previous ${title.toLowerCase()} values`} onClick={() => setPage(currentPage - 1)}><Icon name="chevron-left" size={16} /></Button><span>{currentPage} / {pageCount}</span><Button variant="ghost" size="sm" disabled={currentPage === pageCount} aria-label={`Next ${title.toLowerCase()} values`} onClick={() => setPage(currentPage + 1)}><Icon name="chevron-right" size={16} /></Button></nav>}
      <Button variant="ghost" size="sm" onClick={() => { setExpanded(false); setQuery(''); setSelectedOnly(false); setPage(1); }}>Show top values</Button>
    </div>}
  </section>;
}

export function FacetPanel({ facets, pending, error, onSelect, onRetry, disabled, shared, onLoad, loaded, selectedValues, dirty, onApply, onCancel }: { facets: FacetData[]; pending: boolean; error: Error | null; onSelect: (field: string, value: string) => void; onRetry: () => void; disabled: boolean; shared: boolean; onLoad: () => void; loaded: boolean; selectedValues: (field: string) => string[]; dirty: boolean; onApply: () => void; onCancel: () => void }) {
  const { api, toast, user, refreshSession } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AnalyticsFacet[]>([]);
  const save = useMutation({ mutationFn: async (reset: boolean) => { const response = await api.request<{ success: boolean }>(reset ? 'analytics_settings_delete' : 'analytics_settings', reset ? {} : { facets: settings.map((facet, priority) => ({ ...facet, priority })) }, { mutation: true }); if (response.data?.success !== true) throw new ApiError('unknown', 'The server has not confirmed the settings change.', { outcome: 'unknown' }); }, onSuccess: async () => { toast('Analytics settings saved. Load analytics to apply the new selection.', 'success'); setSettingsOpen(false); await refreshSession(); } });
  const unknownSettings = isApiError(save.error) && save.error.outcome === 'unknown';
  function openSettings() {
    const profileFacets = user && 'analytics_facets' in user && Array.isArray(user.analytics_facets) ? user.analytics_facets as AnalyticsFacet[] : [];
    const hasSavedSettings = Array.isArray(user?.analytics_facets);
    const observed = new Set(facets.map(facet => facet.facet_name));
    setSettings(FACET_NAMES.map((key, priority) => ({ key, enabled: profileFacets.find(facet => facet.key === key)?.enabled ?? (hasSavedSettings ? false : observed.has(key)), priority: profileFacets.find(facet => facet.key === key)?.priority ?? profileFacets.length + priority })).sort((a, b) => a.priority - b.priority));
    if (!unknownSettings) save.reset(); setSettingsOpen(true);
  }
  function move(index: number, offset: number) { const next = [...settings], to = index + offset; if (to < 0 || to >= next.length) return; [next[index], next[to]] = [next[to], next[index]]; setSettings(next); }
  async function reconcile() { try { await refreshSession(); save.reset(); setSettingsOpen(false); toast('Account settings refreshed. Reopen Settings to review them before another change.', 'info'); } catch (cause) { toast(cause instanceof Error ? cause.message : 'Account settings could not be refreshed.', 'error'); } }
  return <aside className="search-facets" aria-label="Result analytics"><div className="search-facets-heading"><h2>Analytics</h2>{loaded && <Button variant="ghost" size="sm" disabled={pending} aria-label="Reload analytics" title={shared ? "Load analytics again using another link use" : "Reload analytics using your current facet settings"} onClick={onRetry}><Icon name="refresh" size={14} /></Button>}{!shared && <Button variant="ghost" size="sm" onClick={openSettings}>Settings</Button>}</div>{!shared && <p className="search-facet-help">Select values, then apply. Values in one group match any; different groups match together.</p>}{dirty && <div className="search-facet-draft"><span role="status">Selection not applied</span><div className="cluster"><Button size="sm" disabled={disabled} onClick={onApply}>Apply filters</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={onCancel}>Cancel</Button></div></div>}{shared && !loaded && <div className="search-facet-notice"><p>This link covers one exact search. Loading analytics uses another link open and the creator’s access.</p><Button variant="secondary" onClick={onLoad}>Load facets</Button></div>}{pending && <Spinner label="Loading analytics" />}{error && <Alert tone="warning" title={facets.length ? 'Some analytics is unavailable' : 'Analytics is unavailable'} actions={<Button variant="secondary" size="sm" onClick={onRetry}>Retry analytics</Button>}>{error.message}</Alert>}{!pending && !error && loaded && !facets.length && <p className="muted">No facet values were returned.</p>}{facets.map(facet => <FacetValues key={facet.facet_name} facet={facet} selected={selectedValues(facet.facet_name)} disabled={disabled} shared={shared} onSelect={onSelect} />)}<Dialog open={settingsOpen} onClose={() => { if (!save.isPending) setSettingsOpen(false); }} title="Analytics settings" footer={<><Button variant="ghost" disabled={save.isPending || unknownSettings} onClick={() => save.mutate(true)}>Reset to defaults</Button><Button variant="secondary" disabled={save.isPending} onClick={() => setSettingsOpen(false)}>Cancel</Button><Button loading={save.isPending} disabled={unknownSettings} onClick={() => save.mutate(false)}>Save changes</Button></>}><p>Choose the facets to load and their order. Public analytics costs one credit per four loaded facets, rounded up.</p><div className="search-facet-settings">{settings.map((facet, index) => <div key={facet.key}><Checkbox label={`${facetTitle(facet.key)} · ${facetUnit(facet.key)}`} checked={facet.enabled} onChange={event => setSettings(settings.map(item => item.key === facet.key ? { ...item, enabled: event.target.checked } : item))} /><Button variant="ghost" size="sm" aria-label={`Move ${facetTitle(facet.key)} up`} disabled={index === 0 || save.isPending} onClick={() => move(index, -1)}>↑</Button><Button variant="ghost" size="sm" aria-label={`Move ${facetTitle(facet.key)} down`} disabled={index === settings.length - 1 || save.isPending} onClick={() => move(index, 1)}>↓</Button></div>)}</div>{save.error && <Alert tone={unknownSettings ? "warning" : "error"} title={unknownSettings ? "Change is not confirmed" : "Settings could not be saved"} actions={unknownSettings ? <Button variant="secondary" onClick={() => void reconcile()}>Check saved settings</Button> : undefined}>{save.error.message}</Alert>}</Dialog></aside>;
}
