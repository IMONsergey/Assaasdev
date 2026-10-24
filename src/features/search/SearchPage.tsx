import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { HostCard, SearchRequest } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Dialog, EmptyState, Icon, Pagination, Spinner } from '../../components/ui';
import { ExportDialog } from '../files/ExportDialog';
import { ConditionsEditor } from './ConditionsEditor';
import { FacetPanel } from './FacetPanel';
import { useFacets } from './useFacets';
import { activeFacetValues, analyticsRequest, dateLabel, decodeSearch, encodeSearch, filterSummary, isShared, PAGE_CAPS, parseHostRows, searchPath, selectedType, searchAccessIssues, validateSearchRequest, withoutShareToken, withType, toggleFacet } from './model';
import type { Dataset } from './model';
import './search.css';

function countryName(code: string | undefined): string {
  if (!code) return 'Location not provided';
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) || code; } catch { return code; }
}

export function SearchAccessNotice() {
  const { session, startGuest } = useApp();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (session.status === 'authenticated' || session.status === 'guest') return null;
  if (session.status === 'loading') return <Spinner label="Checking your session" />;
  return <Alert tone="info" title="Choose how to continue" actions={<><Button variant="secondary" loading={busy} onClick={async () => { setBusy(true); setError(''); try { await startGuest(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Guest access could not be started.'); } finally { setBusy(false); } }}>Continue as guest</Button><Link className="inline-link" to={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link></>}>Guest search has a limited daily allowance. Your query will stay here.{error && <p role="alert">{error}</p>}</Alert>;
}

function ResultRow({ host, request, dataset, backTo }: { host: HostCard; request: SearchRequest; dataset: Dataset; backTo: string }) {
  const shared = isShared(request);
  const params = new URLSearchParams(encodeSearch(withoutShareToken(request)));
  params.set('back', backTo);
  if (shared) params.set('own_access', '1');
  const path = `${dataset === 'private' ? '/private' : ''}/hosts/${encodeURIComponent(host.ip)}`;
  const portHref = (port: number, protocol?: string) => { const next = new URLSearchParams(params); next.set('port', String(port)); if (protocol) next.set('protocol', protocol); return `${path}?${next}`; };
  const ports = host.open_ports;
  return <article className="search-result-row"><div className="search-result-address"><Link className="search-result-ip" to={`${path}?${params}`}>{host.ip}</Link><p>{host.org || <span className="muted">Organization not provided</span>}</p>{host.os && <p className="search-row-meta">{host.os}</p>}{host.labels_list?.length ? <div className="search-labels">{host.labels_list.slice(0, 3).map(label => <Badge key={label}>{label}</Badge>)}{host.labels_list.length > 3 && <span className="muted">+{host.labels_list.length - 3} labels</span>}</div> : null}{shared && <small className="muted">Open details with your own access</small>}</div><div className="search-result-services"><div className="search-port-chips">{ports?.slice(0, 6).map((port, index) => <Link className="search-port-chip" key={`${port.port}-${port.protocol}-${index}`} to={portHref(port.port, port.protocol)} title={`View ${port.port}${port.protocol ? ` / ${port.protocol}` : ''}${shared ? ' using your own access' : ''}`}>{port.port}</Link>)}{ports && ports.length > 6 && <Link className="search-port-overflow" to={`${path}?${params}`}>+{ports.length - 6} more</Link>}</div><p className="search-row-meta">{ports === undefined ? 'Service list not provided' : ports.length === 0 ? '0 observed ports' : [...new Set(ports.map(port => port.protocol).filter(Boolean))].join(' · ') || `${ports.length} observed ports`}</p></div><div className="search-result-observation"><p>{countryName(host.country_code)}</p>{(host.city_name || host.region) && <p className="search-row-meta">{[host.city_name, host.region].filter((value, index, list) => value && list.indexOf(value) === index).join(' · ')}</p>}<time className="search-row-meta">{dateLabel(host.uts)}</time></div></article>;
}

export function SearchPage() {
  const { api, user, session, metadata } = useApp();
  const location = useLocation(), navigate = useNavigate();
  const [params] = useSearchParams();
  const serializedParams = params.toString();
  const parsed = useMemo(() => decodeSearch(new URLSearchParams(serializedParams)), [serializedParams]);
  const dataset: Dataset = location.pathname.startsWith('/private/') || params.get('dataset') === 'private' ? 'private' : 'public';
  const scannerBack = /^\/scanner(?:\?|$)/.test(params.get('scanner_back') || '') ? params.get('scanner_back')! : '/scanner';
  const applied = parsed.request, appliedKey = JSON.stringify(applied), shared = isShared(applied);
  const [draft, setDraft] = useState<SearchRequest>(applied);
  const beforeEditor = useRef<SearchRequest>(applied);
  const previousAppliedKey = useRef(appliedKey);
  const [editorOpen, setEditorOpen] = useState(params.get('conditions') === '1');
  const [inputError, setInputError] = useState('');
  const [toolbar, setToolbar] = useState<HTMLElement | null>(() => document.getElementById('workspace-tools'));
  const [exportOpen, setExportOpen] = useState(false);
  const [facetsRequested, setFacetsRequested] = useState('');
  const [mobileFacets, setMobileFacets] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const [compactResults, setCompactResults] = useState<boolean | null>(null);
  useEffect(() => {
    const element = pageRef.current;
    if (!element) return;
    const update = () => setCompactResults(element.getBoundingClientRect().width <= 820 || window.matchMedia('(max-width: 960px)').matches);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setDraft(applied); setInputError('');
    if (previousAppliedKey.current !== appliedKey) { beforeEditor.current = applied; setEditorOpen(false); previousAppliedKey.current = appliedKey; }
  }, [appliedKey]);
  useEffect(() => { setToolbar(document.getElementById('workspace-tools')); }, []);
  const principal = user?.user_id || user?.session_id || session.status;
  const accessIssues = searchAccessIssues(applied, metadata?.search_restrictions);
  const plan = metadata?.subscription_type || user?.subscription?.type || (session.status === 'guest' ? 'Guest' : 'Free');
  const maxPage = PAGE_CAPS[plan] || 2;
  const page = applied.page || 1, pageSize = applied.docs_per_page || 20;
  const hasAccess = session.status === 'authenticated' || (dataset === 'public' && session.status === 'guest');
  const pageLimitReached = hasAccess && !shared && page > maxPage;
  const facetRequest = useMemo(() => analyticsRequest(applied), [appliedKey]);
  const results = useQuery({ queryKey: ['search', principal, dataset, applied], enabled: hasAccess && parsed.hasSearch && !parsed.error && !pageLimitReached && accessIssues.length === 0, staleTime: Infinity, placeholderData: keepPreviousData, queryFn: async ({ signal }) => {
    const frame = await api.request<unknown>(dataset === 'private' ? 'private_hosts' : 'hosts', applied, { signal });
    return { ...parseHostRows(frame.data), metadata: frame.metadata, request: applied };
  } });
  const facetsEnabled = (mobileFacets || compactResults === false) && hasAccess && parsed.hasSearch && !parsed.error && !pageLimitReached && accessIssues.length === 0 && (!shared || facetsRequested === appliedKey);
  const analytics = useFacets(facetRequest, dataset, facetsEnabled, principal);
  const bodyRequest = results.data?.request || applied;

  function searchHref(request: SearchRequest) { const next = new URLSearchParams(encodeSearch(request)); if (dataset === 'private' && scannerBack !== '/scanner') next.set('scanner_back', scannerBack); return `${searchPath(dataset)}?${next}`; }

  function run(next: SearchRequest) {
    if (shared || isShared(next)) { setInputError('This shared search is fixed. Start your own search to change the query.'); return; }
    try {
      const normalized = validateSearchRequest({ ...next, page: next.page || 1, docs_per_page: next.docs_per_page || 20 });
      const blocked = searchAccessIssues(normalized, metadata?.search_restrictions);
      if (blocked.length) { setInputError(blocked.join(' ') + ' Your draft has been kept.'); return; }
      if ((normalized.page || 1) > maxPage) { setInputError(`Your current plan allows up to ${maxPage} result pages.`); return; }
      const target = searchHref(normalized);
      setEditorOpen(false); setInputError('');
      if (editorOpen) requestAnimationFrame(() => document.getElementById('main-search-query')?.focus({ preventScroll: true }));
      if (JSON.stringify(normalized) === appliedKey && parsed.hasSearch) { if (!results.isFetching) { void results.refetch(); if (facetsEnabled) void analytics.refetch(); } }
      else navigate(target);
    } catch (cause) { setInputError(cause instanceof Error ? cause.message : 'Check the search.'); }
  }
  function chooseType(type: string) { setDraft(current => withType(current, type)); }
  function addFacet(field: string, value: string) { setDraft(current => toggleFacet(current, field, value)); }
  function openEditor() { beforeEditor.current = draft; setInputError(''); setEditorOpen(true); }
  function cancelEditor() { setDraft(beforeEditor.current); setInputError(''); setEditorOpen(false); requestAnimationFrame(() => document.getElementById('search-filter-toggle')?.focus({ preventScroll: true })); }
  const needsWorkspaceLayout = Boolean(parsed.error || inputError || pageLimitReached) || accessIssues.length > 0 || dataset === 'private' || (!hasAccess && session.status !== 'loading');
  const type = selectedType(draft);
  const sortValue = `${applied.sort_field || 'uts'}:${applied.sort_direction || 'desc'}`;
  const facetsDirty = JSON.stringify(draft.simple_search_filters || []) !== JSON.stringify(applied.simple_search_filters || []);
  const queryDirty = parsed.hasSearch && !shared && JSON.stringify(draft) !== appliedKey;
  function clearConditions() { setInputError(''); setDraft(current => ({ ...current, simple_search_filters: [], range_filter: [], security_body: '', robots_body: '', exposed_data: '', min_size_mb: undefined, max_size_mb: undefined })); }
  const tools = <div className="search-toolbar-tools"><Button id="search-filter-toggle" variant="secondary" size="sm" disabled={shared} aria-controls={editorOpen ? 'search-conditions' : undefined} onClick={() => editorOpen ? cancelEditor() : openEditor()} aria-expanded={editorOpen}>Add Filter <span className="search-filter-plus" aria-hidden="true">+</span></Button><label className="search-type-select"><span className="search-sr-only">Result type</span><select value={type} disabled={shared || type === 'custom'} title={type === 'custom' ? 'Edit combined or excluded types in Filters' : undefined} onChange={event => chooseType(event.target.value)}><option value="">All Types</option><option value="ipv4">IPv4</option><option value="ipv6">IPv6</option><option value="domain">Domain</option>{type === 'custom' && <option value="custom" disabled>Custom type logic</option>}{type && !['ipv4', 'ipv6', 'domain', 'custom'].includes(type) && <option value={type}>{type}</option>}</select><Icon name="chevron-down" size={15} /></label></div>;
  return <div ref={pageRef} className={`search-page ${parsed.hasSearch ? 'search-page-results' : 'search-page-home'}${needsWorkspaceLayout ? ' search-page-editing' : ''}`}>
    {toolbar ? createPortal(tools, toolbar) : tools}
    <div className="search-entry">
      {!parsed.hasSearch && <section className="search-home-hero" aria-labelledby="search-home-title">
        <div className="search-home-copy">
          <h1 id="search-home-title">Search internet infrastructure</h1>
          <p>Find hosts, services and networks.</p>
        </div>
      </section>}
      {dataset === 'private' && <div className="search-private-context"><Badge tone="accent">Private results</Badge><span>{applied.task_ids?.length ? `Tasks: ${applied.task_ids.join(', ')}` : 'All accessible scan tasks'}</span><Link to={scannerBack} state={{ restoreScroll: true }}>Back to scanner</Link></div>}
      <form className="search-query-bar" onSubmit={event => { event.preventDefault(); run({ ...draft, page: 1 }); }}><label className="search-sr-only" htmlFor="main-search-query">Search internet infrastructure</label><input id="main-search-query" aria-invalid={Boolean(inputError) || undefined} aria-describedby={inputError ? 'search-input-error' : undefined} value={draft.full_text_search || ''} onChange={event => setDraft({ ...draft, full_text_search: event.target.value })} placeholder="Domain, IP or technical attribute." readOnly={shared} spellCheck={false} autoComplete="off" /><button type="submit" className="search-submit" disabled={shared || results.isFetching} aria-label="Run search">{results.isFetching ? <Spinner label="Searching" /> : <Icon name="arrow" size={20} />}</button></form>
    </div>
    {queryDirty && <div className="search-query-draft"><div><span role="status">Changes not applied</span><p>Apply or cancel changes before sorting, paging, or changing row count.</p></div><div className="cluster"><Button size="sm" onClick={() => run({ ...draft, page: 1 })}>Apply changes</Button><Button size="sm" variant="ghost" onClick={() => { setDraft(applied); setInputError(''); }}>Cancel changes</Button></div></div>}
    <Dialog open={editorOpen && !shared} onClose={cancelEditor} title="Filters" placement="left" className="search-filter-dialog" footer={<><Button type="submit" form="search-conditions-form">Apply conditions</Button><Button variant="secondary" onClick={clearConditions}>Clear conditions</Button><Button variant="ghost" onClick={cancelEditor}>Cancel</Button></>}>
      {editorOpen && <>{inputError && <Alert tone="error" title="Check your search">{inputError}</Alert>}<ConditionsEditor request={draft} onChange={setDraft} onApply={request => run({ ...request, page: 1 })} /></>}
    </Dialog>
    {parsed.error && <Alert tone="error" title="This search link could not be restored" actions={<Button variant="secondary" onClick={() => navigate(searchPath(dataset))}>Start a new search</Button>}>{parsed.error}</Alert>}{pageLimitReached && <Alert tone="warning" title="This page is outside your plan" actions={<><Button variant="secondary" onClick={() => run({ ...applied, page: 1 })}>Return to first page</Button><Link to="/billing">Compare plans</Link></>}>Your current plan includes up to {maxPage} result pages. The query is preserved and no search has been sent for this page.</Alert>}{accessIssues.length > 0 && <Alert tone="warning" title="Some conditions need different access" actions={<Button variant="secondary" onClick={openEditor}>Edit conditions</Button>}>{accessIssues.join(" ")} Your search has been kept. <Link to="/billing">Compare plans</Link></Alert>}{inputError && !editorOpen && <div id="search-input-error"><Alert tone="error" title="Check your search">{inputError}</Alert></div>}{shared && <Alert tone="info" title="Shared search">This exact search uses the creator’s access. Filters, paging and export are locked. Host details use your own access. <Link to={`${searchPath(dataset)}?${encodeSearch(withoutShareToken(applied))}`}>Start your own search</Link></Alert>}{(applied.simple_search_filters?.length || applied.range_filter?.length) ? <div className="search-applied-chips"><span>Applied</span>{applied.simple_search_filters?.map((filter, index) => <button type="button" key={index} disabled={shared} onClick={openEditor}>{filterSummary(filter)}</button>)}{applied.range_filter?.map((range, index) => <span key={`range-${index}`} className="search-range-chip">{range.field}: {range.start ?? 'Any'}–{range.end ?? 'Any'}</span>)}</div> : null}{!hasAccess && (parsed.hasSearch || session.status !== 'loading') && (dataset === 'private' ? <Alert tone="info" title="Sign in to view private results"><Link to={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Continue to sign in</Link></Alert> : <SearchAccessNotice />)}{parsed.hasSearch && hasAccess && !parsed.error && !pageLimitReached && accessIssues.length === 0 && <><div className="search-result-heading"><div><h1>{results.data ? `${results.data.hosts.length.toLocaleString()} hosts returned` : results.isPending ? 'Searching hosts' : 'Search results'}</h1><p className="muted">Page {page} · {dataset === 'private' ? 'Private scan results' : 'Observed services and metadata'}{results.isPlaceholderData ? ' · Showing the previous search while updating' : ''}</p></div><div className="search-result-actions"><Link className="search-secondary-link" to={`/search/share?${encodeSearch(applied)}${dataset === 'private' ? '&dataset=private' : ''}`}><Icon name="copy" size={18} />Share</Link><Button variant="secondary" size="sm" disabled={shared || results.isFetching || !results.data?.hosts.length} onClick={() => setExportOpen(true)}><Icon name="download" size={18} />Export</Button><Link className="search-secondary-link" to={`/search/saved?${encodeSearch(applied)}${dataset === 'private' ? '&dataset=private' : ''}`}>Saved queries</Link></div></div>{results.isFetching && <div className="search-request-status" role="status"><Spinner label={results.data ? 'Updating results; previous results are shown until the response arrives.' : 'Loading hosts'} /></div>}{results.error && <Alert tone="error" title="Search could not be completed" actions={<><Button variant="secondary" onClick={() => void results.refetch()}>Try again</Button><Link to="/billing">Compare plans</Link></>}>{results.error.message} Your query and conditions have been kept.</Alert>}{Boolean(results.data && (results.data.omittedCount || results.data.incompleteCount)) && <Alert tone="warning" title="Some returned data is incomplete">{results.data!.omittedCount ? `${results.data!.omittedCount} record${results.data!.omittedCount === 1 ? '' : 's'} without a usable address could not be shown. ` : ''}{results.data!.incompleteCount ? 'Available host details are shown; invalid fields have been left blank. ' : ''}Your search and the original page size are preserved.</Alert>}{Boolean(results.data?.metadata?.result_restrictions?.hidden_fields?.length || results.data?.metadata?.result_restrictions?.hidden_labels?.length) && <p className="search-access-note">Some fields or labels are hidden by your access. {results.data?.metadata?.result_restrictions?.hidden_fields?.length ? `Hidden fields: ${results.data.metadata.result_restrictions.hidden_fields.join(", ")}. ` : ""}{results.data?.metadata?.result_restrictions?.hidden_labels?.length ? `Hidden labels: ${results.data.metadata.result_restrictions.hidden_labels.join(", ")}.` : ""} <Link to="/billing">View plans</Link></p>}<div className="search-result-toolbar"><Button className="search-mobile-facets-toggle" variant="secondary" size="sm" onClick={() => setMobileFacets(!mobileFacets)} aria-expanded={mobileFacets}>Analytics</Button><label>Sort <select value={sortValue} disabled={shared || results.isFetching || queryDirty} onChange={event => { const [sort_field, sort_direction] = event.target.value.split(':'); run({ ...applied, sort_field, sort_direction, page: 1 }); }}><option value="uts:desc">Newest observation</option><option value="uts:asc">Oldest observation</option><option value="ip:asc">Address ascending</option><option value="ip:desc">Address descending</option>{!['uts:desc', 'uts:asc', 'ip:asc', 'ip:desc'].includes(sortValue) && <option value={sortValue}>{applied.sort_field} · {applied.sort_direction || 'desc'}</option>}</select></label><label>Rows <select value={pageSize} disabled={shared || results.isFetching || queryDirty} onChange={event => run({ ...applied, docs_per_page: Number(event.target.value), page: 1 })}>{[10, 20, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}{![10, 20, 25, 50].includes(pageSize) && <option value={pageSize}>{pageSize}</option>}</select></label></div><div className={`search-results-workspace ${mobileFacets ? 'search-facets-open' : ''}`}><FacetPanel selectedValues={field => activeFacetValues(draft, field)} dirty={facetsDirty} onApply={() => run({ ...draft, page: 1 })} onCancel={() => setDraft(applied)} facets={analytics.facets} pending={analytics.isFetching} error={analytics.error} onSelect={addFacet} onRetry={() => void analytics.refetch()} disabled={shared || editorOpen} shared={shared} loaded={facetsEnabled} onLoad={() => setFacetsRequested(appliedKey)} /><div className="search-results-list"><div className="search-results-columns" aria-hidden="true"><span>Host / network</span><span>Services</span><span>Observation</span></div>{results.data?.hosts.map((host, index) => <ResultRow key={`${host.ip}-${index}`} host={host} request={bodyRequest} dataset={dataset} backTo={results.isPlaceholderData ? searchHref(bodyRequest) : location.pathname + location.search} />)}{results.isSuccess && !results.data.hosts.length && <EmptyState title={results.data.omittedCount ? 'No usable host records' : 'No matching hosts'} description={results.data.omittedCount ? 'The server returned records without usable addresses. Try another page or refine the search.' : page > 1 ? 'No records were returned on this page. Return to the previous page or change your search.' : 'Try changing the text or removing a condition.'} actions={<Button variant="secondary" onClick={() => { if (page > 1) run({ ...applied, page: page - 1 }); else openEditor(); }}>{page > 1 ? 'Previous page' : 'Edit filters'}</Button>} />}{results.isPending && !results.data && <div className="search-results-skeleton" aria-hidden="true">{[0, 1, 2, 3].map(row => <div key={row}><span /><span /><span /></div>)}</div>}{results.data && !shared && <><Pagination page={page} pageSize={pageSize} count={results.data.receivedCount} maxPage={maxPage} disabled={results.isFetching || queryDirty} onPageChange={next => run({ ...applied, page: next })} /><p className="search-pagination-note">The server returns a page of hosts without a total. {page >= maxPage ? `Your plan’s ${maxPage}-page limit is reached.` : 'A full page may have a following page.'}</p></>}</div></div></>}<ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} query={applied} privateSearch={dataset === 'private'} taskIds={applied.task_ids} shareToken={applied.st || applied.share_token} /></div>;
}
