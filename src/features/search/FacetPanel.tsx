import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError, isApiError } from '../../api';
import type { AnalyticsFacet, FacetData } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Button, Checkbox, Dialog, EmptyState, Field, Icon, Skeleton } from '../../components/ui';
import { FACET_NAMES, facetTitle, facetUnit } from './model';
import { CountryFlag } from '../../components/CountryFlag';
import { TechnologyMark } from '../../components/TechnologyMark';

const FACET_PAGE_SIZE = 50;
const FACET_OVERVIEW_SIZE = 5;

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
  const pageSize = browsing ? FACET_PAGE_SIZE : FACET_OVERVIEW_SIZE;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const shown = filtered.slice(start, start + pageSize);
  const max = values.reduce((highest, value) => Math.max(highest, value.count || 0), 0);
  return <section className="search-facet" aria-labelledby={headingId}>
    <div className="search-facet-title"><h3 id={headingId}><Icon name={facet.facet_name.includes('country') ? 'globe' : facet.facet_name === 'org' ? 'users' : facet.facet_name.includes('product') || facet.facet_name.includes('vendor') ? 'package' : facet.facet_name === 'port' ? 'server' : 'chart'} size={17} />{title}</h3><span>{facetUnit(facet.facet_name)}</span></div>
    {(values.length > 10 || query) && <Field className="search-facet-search" type="search" label={`Search ${title.toLowerCase()} values`} value={query} placeholder={`Search ${values.length.toLocaleString()} values`} onChange={event => { setQuery(event.target.value); setPage(1); setExpanded(true); }} />}
    {selected.length > 0 && <button type="button" className="search-facet-selection" aria-pressed={selectedOnly} onClick={() => { setSelectedOnly(!selectedOnly); setPage(1); }}>Selected ({selected.length.toLocaleString()})</button>}
    <div className="search-facet-values">
      {shown.map(value => <div key={value.key} className="search-facet-item">
        <button type="button" disabled={disabled} aria-pressed={selection.has(value.key)} title={shared ? 'This shared search is fixed. Start your own search to change it.' : `${selection.has(value.key) ? 'Remove' : 'Add'} ${value.key} filter`} onClick={() => onSelect(facet.facet_name, value.key)}><span>{selection.has(value.key) && <Icon name="check" size={13} />}{facet.facet_name === 'country_name' && <CountryFlag name={value.key} />}{facet.facet_name === 'country_code' && <CountryFlag code={value.key} />}{(facet.facet_name === 'products' || facet.facet_name === 'vendors') && <TechnologyMark name={value.key} size={18} />}{value.key}</span><strong title={value.count === null ? 'Count not returned' : undefined}>{value.count === null ? '—' : value.count.toLocaleString()}</strong></button>
        <div className="search-facet-track" aria-hidden="true"><span style={{ width: `${max && value.count !== null ? value.count / max * 100 : 0}%` }} /></div>
      </div>)}
    </div>
    {!filtered.length && <p className="search-facet-empty">No matching values.</p>}
    {!browsing && filtered.length > FACET_OVERVIEW_SIZE && <Button className="search-facet-browse" variant="ghost" size="sm" onClick={() => { setExpanded(true); setPage(1); }}>Browse all {filtered.length.toLocaleString()} values</Button>}
    {browsing && <div className="search-facet-pagination">
      <p role="status">{filtered.length ? `${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length.toLocaleString()}` : '0 values'}</p>
      {pageCount > 1 && <nav aria-label={`${title} value pages`}><Button variant="ghost" size="sm" disabled={currentPage === 1} aria-label={`Previous ${title.toLowerCase()} values`} onClick={() => setPage(currentPage - 1)}><Icon name="chevron-left" size={16} /></Button><span>{currentPage} / {pageCount}</span><Button variant="ghost" size="sm" disabled={currentPage === pageCount} aria-label={`Next ${title.toLowerCase()} values`} onClick={() => setPage(currentPage + 1)}><Icon name="chevron-right" size={16} /></Button></nav>}
      <Button variant="ghost" size="sm" onClick={() => { setExpanded(false); setQuery(''); setSelectedOnly(false); setPage(1); }}>Show top values</Button>
    </div>}
  </section>;
}

export function FacetPanel({ facets, pending, error, onSelect, onRetry, disabled, loadDisabled, shared, onLoad, loaded, selectedValues, requestKey }: { facets: FacetData[]; pending: boolean; error: Error | null; onSelect: (field: string, value: string) => void; onRetry: () => void; disabled: boolean; loadDisabled: boolean; shared: boolean; onLoad: () => void; loaded: boolean; selectedValues: (field: string) => string[]; requestKey: string }) {
  const { api, toast, user, refreshSession } = useApp();
  const analyticsActions = useRef<HTMLDivElement>(null);
  const initialLoadFocus = useRef<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AnalyticsFacet[]>([]);
  useEffect(() => {
    const cancelFocus = () => { initialLoadFocus.current = null; };
    const changedFocus = (event: FocusEvent) => { if (event.target !== document.body) cancelFocus(); };
    document.addEventListener('focusin', changedFocus, true);
    document.addEventListener('pointerdown', cancelFocus, true);
    document.addEventListener('keydown', cancelFocus, true);
    window.addEventListener('blur', cancelFocus);
    window.addEventListener('popstate', cancelFocus);
    return () => {
      document.removeEventListener('focusin', changedFocus, true);
      document.removeEventListener('pointerdown', cancelFocus, true);
      document.removeEventListener('keydown', cancelFocus, true);
      window.removeEventListener('blur', cancelFocus);
      window.removeEventListener('popstate', cancelFocus);
    };
  }, []);
  useLayoutEffect(() => {
    if (pending || initialLoadFocus.current === null) return;
    const requestedFocus = initialLoadFocus.current;
    initialLoadFocus.current = null;
    // The initial action disappears while loading. Restore its replacement
    // only if this request still owns focus and the user has stayed here.
    if (!loaded || loadDisabled || requestedFocus !== requestKey || document.activeElement !== document.body || !document.hasFocus()) return;
    const reload = analyticsActions.current?.querySelector<HTMLButtonElement>('[aria-label="Reload analytics"]');
    if (reload && !reload.disabled && reload.getClientRects().length) reload.focus({ preventScroll: true });
  }, [pending, loaded, loadDisabled, requestKey]);
  const save = useMutation({ mutationFn: async (reset: boolean) => { const response = await api.request<{ success: boolean }>(reset ? 'analytics_settings_delete' : 'analytics_settings', reset ? {} : { facets: settings.map((facet, priority) => ({ ...facet, priority })) }, { mutation: true }); if (response.data?.success !== true) throw new ApiError('unknown', 'The server has not confirmed the settings change.', { outcome: 'unknown' }); }, onSuccess: async () => { toast('Analytics settings saved.', 'success'); setSettingsOpen(false); await refreshSession(); } });
  const unknownSettings = isApiError(save.error) && save.error.outcome === 'unknown';
  function openSettings() {
    const profileFacets = user && 'analytics_facets' in user && Array.isArray(user.analytics_facets) ? user.analytics_facets as AnalyticsFacet[] : [];
    const hasSavedSettings = Array.isArray(user?.analytics_facets);
    const observed = new Set(facets.map(facet => facet.facet_name));
    setSettings(FACET_NAMES.map((key, priority) => ({ key, enabled: profileFacets.find(facet => facet.key === key)?.enabled ?? (hasSavedSettings ? false : observed.has(key)), priority: profileFacets.find(facet => facet.key === key)?.priority ?? profileFacets.length + priority })).sort((a, b) => a.priority - b.priority));
    if (!unknownSettings) save.reset(); setSettingsOpen(true);
  }
  function move(index: number, offset: number) { const next = [...settings], to = index + offset; if (to < 0 || to >= next.length) return; [next[index], next[to]] = [next[to], next[index]]; setSettings(next); }
  async function reconcile() { try { await refreshSession(); save.reset(); setSettingsOpen(false); toast('Settings refreshed. Review them before another change.', 'info'); } catch (cause) { toast(cause instanceof Error ? cause.message : 'Account settings could not be refreshed.', 'error'); } }
  return <aside className="search-facets" aria-label="Result analytics">
    <div className="search-facets-heading">
      <div><h2>{loaded ? 'Search breakdown' : 'Analytics'}</h2>{loaded && <p>Applied search</p>}</div>
      <div ref={analyticsActions} className="cluster">{!shared && <Button className="search-analytics-settings" variant="ghost" size="sm" aria-label="Analytics settings" onClick={openSettings}><Icon name="settings" size={16} /><span className="search-analytics-settings-label">Settings</span></Button>}{loaded && <Button variant="secondary" size="sm" loading={pending} disabled={loadDisabled} aria-label="Reload analytics" title={loadDisabled ? 'Apply or cancel changes first' : shared ? 'Uses another link use' : 'Uses analytics credits'} onClick={onRetry}><Icon name="refresh" size={16} />Reload</Button>}</div>
    </div>
    {!loaded && !pending && !error && <div className="search-analytics-start"><span className="search-analytics-symbol"><Icon name="chart" size={30} /></span><h3>Understand the matching hosts</h3><p>Compare countries, networks, ports and products.</p><Button disabled={loadDisabled} onClick={event => { initialLoadFocus.current = document.activeElement === event.currentTarget ? requestKey : null; onLoad(); }} title={loadDisabled ? 'Apply or cancel changes first' : undefined}>Load analytics</Button><small>{loadDisabled ? 'Apply or cancel your changes to continue.' : shared ? 'Uses one link use and the creator’s access.' : 'Uses analytics credits.'}</small></div>}
    {pending && !facets.length && <div className="search-facet-grid" aria-label="Loading analytics">{[0, 1, 2].map(index => <Skeleton key={index} rows={6} className="search-facet-skeleton" />)}</div>}
    {error && <Alert tone="warning" title={facets.length ? 'Some analytics is unavailable' : 'Analytics is unavailable'} actions={<Button variant="secondary" size="sm" disabled={loadDisabled || pending} onClick={onRetry}>Retry analytics</Button>}>{error.message}</Alert>}
    {!pending && !error && loaded && !facets.length && <EmptyState title="No analytics returned" description="Try different conditions or choose another set of facets." />}
    {facets.length > 0 && <div className="search-facet-grid" aria-busy={pending}>{facets.map(facet => <FacetValues key={facet.facet_name} facet={facet} selected={selectedValues(facet.facet_name)} disabled={disabled} shared={shared} onSelect={onSelect} />)}</div>}
    <Dialog open={settingsOpen} onClose={() => { if (!save.isPending) setSettingsOpen(false); }} title="Analytics settings" footer={<><Button variant="ghost" disabled={save.isPending || unknownSettings} onClick={() => save.mutate(true)}>Reset</Button><Button variant="secondary" disabled={save.isPending} onClick={() => setSettingsOpen(false)}>Cancel</Button><Button loading={save.isPending} disabled={unknownSettings} onClick={() => save.mutate(false)}>Save changes</Button></>}>
      <p className="search-settings-cost">Choose what to load next. Public analytics uses one credit per four facets, rounded up.</p>
      <div className="search-facet-settings">{settings.map((facet, index) => <div key={facet.key}><Checkbox label={facetTitle(facet.key)} checked={facet.enabled} disabled={save.isPending} onChange={event => setSettings(settings.map(item => item.key === facet.key ? { ...item, enabled: event.target.checked } : item))} /><Button variant="ghost" size="sm" aria-label={`Move ${facetTitle(facet.key)} up`} disabled={index === 0 || save.isPending} onClick={() => move(index, -1)}><Icon name="chevron-up" size={16} /></Button><Button variant="ghost" size="sm" aria-label={`Move ${facetTitle(facet.key)} down`} disabled={index === settings.length - 1 || save.isPending} onClick={() => move(index, 1)}><Icon name="chevron-down" size={16} /></Button></div>)}</div>
      {save.error && <Alert tone={unknownSettings ? 'warning' : 'error'} title={unknownSettings ? 'Change is not confirmed' : 'Settings could not be saved'} actions={unknownSettings ? <Button variant="secondary" onClick={() => void reconcile()}>Check saved settings</Button> : undefined}>{save.error.message}</Alert>}
    </Dialog>
  </aside>;
}
