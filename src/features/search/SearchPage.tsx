import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HostCard, SearchRequest } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Dialog, EmptyState, FilterButton, Icon, Pagination, SelectControl, Skeleton, Spinner, TabPanel, Tabs } from '../../components/ui';
import { ExportDialog } from '../files/ExportDialog';
import { ConditionsEditor } from './ConditionsEditor';
import { FacetPanel } from './FacetPanel';
import { SearchAutocomplete } from './SearchAutocomplete';
import { SaveQueryDialog } from './SaveQueryDialog';
import { ShareSearchDialog } from './ShareSearchDialog';
import { DotCascade, DoubleButton, OrbCubeLoader } from '../../components/brand';
import { CountryFlag } from '../../components/CountryFlag';
import { ProtocolMark, TechnologyMark } from '../../components/TechnologyMark';
import { labelGlyph } from '../../components/technology-marks';
import { useFacets } from './useFacets';
import { rememberSubmittedSearch } from './history-store';
import { activeFacetValues, analyticsRequest, dateLabel, decodeSearch, encodeSearch, filterSummary, isShared, PAGE_CAPS, parseHostRows, searchPath, selectedType, searchAccessIssues, validateSearchRequest, withoutShareToken, withType, toggleFacet } from './model';
import type { Dataset } from './model';
import './search.css';

function countryName(code: string | undefined): string {
  if (!code) return '—';
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) || code; } catch { return code; }
}

export function SearchAccessNotice() {
  const { session, startGuest } = useApp();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (session.status === 'authenticated' || session.status === 'guest') return null;
  if (session.status === 'loading') return <Spinner label="Checking your session" />;
  return <Alert tone="info" title="Choose how to continue" actions={<><Button variant="secondary" loading={busy} onClick={async () => { setBusy(true); setError(''); try { await startGuest(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Guest access could not be started.'); } finally { setBusy(false); } }}>Continue as guest</Button><Link className="inline-link" to={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link></>}>Guest search includes a daily allowance.{error && <p role="alert">{error}</p>}</Alert>;
}

function ResultRow({ host, request, dataset, backTo }: { host: HostCard; request: SearchRequest; dataset: Dataset; backTo: string }) {
  const navigate = useNavigate();
  const shared = isShared(request);
  const params = new URLSearchParams(encodeSearch(withoutShareToken(request)));
  params.set('back', backTo);
  if (shared) params.set('own_access', '1');
  const path = `${dataset === 'private' ? '/private' : ''}/hosts/${encodeURIComponent(host.ip)}`;
  const href = `${path}?${params}`;
  const portHref = (port: number, protocol?: string) => { const next = new URLSearchParams(params); next.set('port', String(port)); if (protocol) next.set('protocol', protocol); return `${path}?${next}`; };
  const servicesParams = new URLSearchParams(params); servicesParams.set('tab', 'services'); servicesParams.set('panel', 'list');
  const ports = host.open_ports;
  const observed = typeof host.uts === 'number' && Number.isFinite(host.uts) && !Number.isNaN(new Date(host.uts * 1000).getTime());
  const protocols = [...new Set(ports?.map(port => port.protocol?.trim().toLowerCase()).filter((protocol): protocol is string => Boolean(protocol)))];
  const date = observed ? new Date(host.uts! * 1000) : undefined;
  const dateText = date?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const timeText = date?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return <article className="search-result-row" onClick={event => { if (event.defaultPrevented || (event.target as HTMLElement).closest('a,button,input,select,summary') || window.getSelection()?.toString()) return; if (event.metaKey || event.ctrlKey) window.open(href, '_blank', 'noopener'); else navigate(href); }}>
    <div className="search-result-address">
      <div className="search-result-identity"><span className="search-network-mark"><TechnologyMark kind="provider" name={host.org} size={21} /></span><div><Link className="search-result-ip" to={href}><span>{host.ip}</span><Icon name="arrow-up-right" size={15} /></Link><p className="search-result-org">{host.org || <span className="muted" title="Organization not provided">—</span>}</p></div></div>
      {(host.os || host.labels_list?.length) ? <div className="search-labels">{host.os && <span className="search-row-meta search-os"><TechnologyMark kind="os" name={host.os} size={15} />{host.os}</span>}{host.labels_list?.slice(0, 2).map(label => <Badge key={label}>{labelGlyph(label) && <Icon name={labelGlyph(label)!} size={12} />}{label}</Badge>)}{host.labels_list && host.labels_list.length > 2 && <span className="muted" title={host.labels_list.slice(2).join(', ')}>+{host.labels_list.length - 2}</span>}</div> : null}
    </div>
    <div className="search-result-services">
      <div className="search-port-chips">{ports?.slice(0, 4).map((port, index) => <Link className="search-port-chip" key={`${port.port}-${port.protocol}-${index}`} to={portHref(port.port, port.protocol)} title={`View ${port.port}${port.protocol ? ` / ${port.protocol}` : ''}${shared ? ' using your own access' : ''}`}>{port.port}</Link>)}{ports && ports.length > 4 && <Link className="search-port-overflow" to={`${path}?${servicesParams}`} title={`View all ${ports.length.toLocaleString()} observed ports`}>+{ports.length - 4}<Icon name="chevron-right" size={12} /></Link>}</div>
      {protocols.length ? <div className="search-protocols">{protocols.slice(0, 3).map(protocol => <span key={protocol}><ProtocolMark protocol={protocol} size={13} />{protocol}</span>)}{protocols.length > 3 && <span title={protocols.slice(3).join(', ')}>+{protocols.length - 3}</span>}</div> : <p className="search-row-meta" title={ports === undefined ? 'Service list not provided' : undefined}>{ports === undefined ? '—' : `${ports.length} observed ports`}</p>}
    </div>
    <div className="search-result-location"><p title={!host.country_code ? 'Location not provided' : undefined}><CountryFlag code={host.country_code} />{countryName(host.country_code)}</p>{(host.city_name || host.region) && <p className="search-row-meta">{[host.city_name, host.region].filter((value, index, list) => value && list.indexOf(value) === index).join(' · ')}</p>}</div>
    <div className="search-result-observation"><Icon name="clock" size={14} /><time className="search-row-meta" dateTime={date?.toISOString()} title={observed ? dateLabel(host.uts) : 'Observation time not provided'}>{date ? <><span>{dateText}</span><small>{timeText} UTC</small></> : '—'}</time></div>
  </article>;
}

export function SearchPage() {
  const { api, user, session, metadata } = useApp();
  const location = useLocation(), navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const serializedParams = params.toString();
  const parsed = useMemo(() => decodeSearch(new URLSearchParams(serializedParams)), [serializedParams]);
  const dataset: Dataset = location.pathname.startsWith('/private/') || params.get('dataset') === 'private' ? 'private' : 'public';
  const scannerBack = /^\/scanner(?:\?|$)/.test(params.get('scanner_back') || '') ? params.get('scanner_back')! : '/scanner';
  const view = params.get('view') === 'analytics' ? 'analytics' : 'results';
  // Guided navigation can restore a query without silently spending another credit.
  // This intent lives only in router memory; the URL remains a normal shareable query.
  const previewOnly = params.get('draft') === '1' || location.state?.onboardingPreviewOnly === true;
  const applied = parsed.request, appliedKey = JSON.stringify(applied), shared = isShared(applied);
  const [draft, setDraft] = useState<SearchRequest>(applied);
  const beforeEditor = useRef<SearchRequest>(applied);
  const previousAppliedKey = useRef(appliedKey);
  const [editorOpen, setEditorOpen] = useState(params.get('conditions') === '1');
  const [inputError, setInputError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [searchAction, setSearchAction] = useState<'save' | 'share' | null>(null);
  useEffect(() => { setSearchAction(null); }, [appliedKey, dataset, user?.user_id, session.status]);
  useEffect(() => {
    setDraft(applied); setInputError('');
    if (previousAppliedKey.current !== appliedKey) { beforeEditor.current = applied; setEditorOpen(false); previousAppliedKey.current = appliedKey; }
  }, [appliedKey]);
  const requestedEditor = params.get('conditions') === '1';
  useEffect(() => {
    if (!requestedEditor || shared || session.status === 'loading') return;
    beforeEditor.current = applied; setDraft(applied); setInputError(''); setEditorOpen(true);
    const next = new URLSearchParams(window.location.search);
    if (next.get('conditions') === '1') {
      next.delete('conditions');
      navigate(`${location.pathname}${next.size ? `?${next}` : ''}`, { replace: true, state: { ...location.state, preserveTabFocus: true } });
    }
  }, [requestedEditor, appliedKey, shared, location.pathname, session.status]);
  const principal = user?.user_id || user?.session_id || session.status;
  const accessIssues = searchAccessIssues(applied, metadata?.search_restrictions);
  const plan = metadata?.subscription_type || user?.subscription?.type || (session.status === 'guest' ? 'Guest' : 'Free');
  const maxPage = PAGE_CAPS[plan] || 2;
  const page = applied.page || 1, pageSize = applied.docs_per_page || 20;
  const hasAccess = session.status === 'authenticated' || (dataset === 'public' && session.status === 'guest');
  const pageLimitReached = hasAccess && !shared && page > maxPage;
  const canRequest = hasAccess && parsed.hasSearch && !parsed.error && !pageLimitReached && accessIssues.length === 0;
  const facetRequest = useMemo(() => analyticsRequest(applied), [appliedKey]);
  const results = useQuery({ queryKey: ['search', principal, dataset, applied], enabled: canRequest && !previewOnly, staleTime: Infinity, placeholderData: keepPreviousData, queryFn: async ({ signal }) => {
    rememberSubmittedSearch(session.status === 'authenticated' ? user?.user_id : undefined, applied, dataset, scannerBack, location.state?.searchHistoryPresentation !== true);
    const frame = await api.request<unknown>(dataset === 'private' ? 'private_hosts' : 'hosts', applied, { signal });
    return { ...parseHostRows(frame.data), metadata: frame.metadata, request: applied };
  } });
  // Loading analytics is a separate, explicit action. Local tabs and cached
  // value browsing must never start another billable request.
  const analytics = useFacets(facetRequest, dataset, false, principal);
  const displayResults = previewOnly ? undefined : results.data;
  const bodyRequest = results.data?.request || applied;
  const queryDirty = parsed.hasSearch && !shared && JSON.stringify(draft) !== appliedKey;

  function searchHref(request: SearchRequest, nextView = 'results') {
    const next = new URLSearchParams(encodeSearch(request));
    if (dataset === 'private' && scannerBack !== '/scanner') next.set('scanner_back', scannerBack);
    if (nextView === 'analytics') next.set('view', 'analytics');
    return `${searchPath(dataset)}?${next}`;
  }
  function changeView(nextView: string) {
    const next = new URLSearchParams(window.location.search);
    if (nextView === 'analytics') next.set('view', 'analytics'); else next.delete('view');
    navigate(`${location.pathname}?${next}`, { replace: true, state: { ...location.state, preserveTabFocus: true } });
  }
  function run(next: SearchRequest, presentation = false) {
    if (shared || isShared(next)) { setInputError('Start your own search to change this shared query.'); return; }
    try {
      const normalized = validateSearchRequest({ ...next, page: next.page || 1, docs_per_page: next.docs_per_page || 20 });
      const blocked = searchAccessIssues(normalized, metadata?.search_restrictions);
      if (blocked.length) { setInputError(blocked.join(' ')); return; }
      if ((normalized.page || 1) > maxPage) { setInputError(`Your current plan allows up to ${maxPage} result pages.`); return; }
      setEditorOpen(false); setInputError('');
      if (previewOnly) void queryClient.invalidateQueries({ queryKey: ['search', principal, dataset, normalized], exact: true, refetchType: 'none' });
      if (editorOpen) requestAnimationFrame(() => document.getElementById('main-search-query')?.focus({ preventScroll: true }));
      if (JSON.stringify(normalized) === appliedKey && parsed.hasSearch) {
        if (previewOnly) {
          const state = { ...location.state }; delete state.onboardingPreviewOnly;
          navigate(searchHref(normalized), { replace: true, state: { ...state, preserveTabFocus: true } });
          return;
        }
        if (view !== 'results') changeView('results');
        if (!results.isFetching) void results.refetch();
      } else navigate(searchHref(normalized), { state: presentation ? { searchHistoryPresentation: true } : null });
    } catch (cause) { setInputError(cause instanceof Error ? cause.message : 'Check the search.'); }
  }
  function loadAnalytics() { if (canRequest && !queryDirty && !analytics.isFetching) void analytics.refetch(); }
  function openEditor() { beforeEditor.current = draft; setInputError(''); setEditorOpen(true); }
  function addSuggestedFilter(field: string, value: string) { beforeEditor.current = draft; setDraft(current => ({ ...current, full_text_search: '', simple_search_filters: [...(current.simple_search_filters || []), { field, value }] })); setInputError(''); setEditorOpen(true); }
  function cancelEditor() { setDraft(beforeEditor.current); setInputError(''); setEditorOpen(false); requestAnimationFrame(() => document.getElementById('search-filter-toggle')?.focus({ preventScroll: true })); }
  function clearConditions() { setInputError(''); setDraft(current => ({ ...current, simple_search_filters: [], range_filter: [], security_body: '', robots_body: '', exposed_data: '', min_size_mb: undefined, max_size_mb: undefined })); }
  const type = selectedType(draft);
  const sortValue = `${applied.sort_field || 'uts'}:${applied.sort_direction || 'desc'}`;
  const filterCount = (draft.simple_search_filters?.length || 0) + (draft.range_filter?.length || 0) + [draft.security_body, draft.robots_body, draft.exposed_data, draft.min_size_mb, draft.max_size_mb].filter(value => value !== undefined && value !== '').length;
  const appliedFilters = applied.simple_search_filters || [];
  const needsWorkspaceLayout = Boolean(parsed.error || inputError || pageLimitReached) || accessIssues.length > 0 || dataset === 'private' || (!hasAccess && session.status !== 'loading');
  const restriction = results.data?.metadata?.result_restrictions;

  return <div className={`search-page ${parsed.hasSearch ? 'search-page-results' : 'search-page-home'}${needsWorkspaceLayout ? ' search-page-editing' : ''}`}>
    {!parsed.hasSearch && <DotCascade overlay className="search-dots" startOpacity={.32} endOpacity={.10} dotRadius={1.2} spacing={26} hoverRadius={145} displacement={3} />}
    <div className="search-entry">
      {!parsed.hasSearch && <section className="search-home-hero" aria-labelledby="search-home-title"><div className="search-home-copy"><h1 id="search-home-title">Search internet infrastructure</h1><p>Explore hosts, services and networks.</p></div></section>}
      {dataset === 'private' && <div className="search-private-context"><Badge tone="accent">Private results</Badge><span title={applied.task_ids?.join(', ')}>{applied.task_ids?.length ? `${applied.task_ids.length} scan ${applied.task_ids.length === 1 ? 'task' : 'tasks'}` : 'All scan tasks'}</span><Link to={scannerBack} state={{ restoreScroll: true }}><Icon name="chevron-left" size={15} />Back to scanner</Link></div>}
      <div className="search-composer">
        <div className="search-query-controls"><div className="search-toolbar-tools">
          <FilterButton id="search-filter-toggle" aria-label="Filters" size="sm" disabled={shared} active={editorOpen || filterCount > 0} count={filterCount} aria-controls={editorOpen ? 'search-conditions' : undefined} onClick={openEditor} aria-expanded={editorOpen} />
          <div className="search-type-select"><SelectControl aria-label="Result type" value={type} disabled={shared || type === 'custom'} title={type === 'custom' ? 'Edit combined or excluded types in Filters' : undefined} onChange={event => setDraft(current => withType(current, event.target.value))}><option value="">All types</option><option value="ipv4">IPv4</option><option value="ipv6">IPv6</option><option value="domain">Domain</option>{type === 'custom' && <option value="custom" disabled>Custom type logic</option>}{type && !['ipv4', 'ipv6', 'domain', 'custom'].includes(type) && <option value={type}>{type}</option>}</SelectControl></div>
        </div><Link className="search-saved-shortcut search-history-shortcut" to={`/search/history${dataset === 'private' ? '?dataset=private' : ''}`} aria-label="Search history" title="Search history"><Icon name="clock" size={16} />History</Link></div>
        <form className="search-query-bar" onSubmit={event => { event.preventDefault(); run({ ...draft, page: 1 }); }}>
          <Icon name="search" size={22} /><SearchAutocomplete value={draft.full_text_search || ''} onChange={full_text_search => setDraft(current => ({ ...current, full_text_search }))} onSearch={full_text_search => run({ ...draft, full_text_search, page: 1 })} onFilter={addSuggestedFilter} invalid={Boolean(inputError)} describedBy={inputError ? 'search-input-error' : undefined} readOnly={shared} />
          <DoubleButton type="submit" compact className="search-submit-button" disabled={shared || (results.isFetching && !queryDirty)} aria-label="Run search" aria-busy={results.isFetching && !queryDirty || undefined} title={parsed.hasSearch && !queryDirty ? 'Run this search again' : 'Run search'}>{results.isFetching && !queryDirty ? <OrbCubeLoader size={20} decorative color="currentColor" /> : <span>Search</span>}</DoubleButton>
        </form>
      </div>
      {!parsed.hasSearch && <div className="search-home-support"><p className="search-query-kinds"><span><Icon name="search" size={15} />Text query</span><span><Icon name="globe" size={15} />Domain</span><span><Icon name="server" size={15} />IP / CIDR</span><span><Icon name="package" size={15} />Technology</span></p></div>}
    </div>

    {queryDirty && !editorOpen && <div className="search-query-draft"><span role="status"><span className="search-draft-dot" />Changes not applied</span><div className="cluster"><Button size="sm" onClick={() => run({ ...draft, page: 1 })}>Apply changes</Button><Button size="sm" variant="ghost" onClick={() => { setDraft(applied); setInputError(''); }}>Cancel changes</Button></div></div>}
    <Dialog open={editorOpen && !shared} onClose={cancelEditor} title="Filters" placement="left" scope="workspace" className="search-filter-dialog" footer={<><Button variant="ghost" onClick={clearConditions}>Reset</Button><Button variant="secondary" onClick={cancelEditor}>Cancel</Button><Button type="submit" form="search-conditions-form">Apply conditions</Button></>}>
      {editorOpen && <>{inputError && <Alert tone="error" title="Check your search">{inputError}</Alert>}<ConditionsEditor request={draft} onChange={setDraft} onApply={request => run({ ...request, page: 1 })} /></>}
    </Dialog>
    {parsed.error && <Alert tone="error" title="This search link could not be restored" actions={<Button variant="secondary" onClick={() => navigate(searchPath(dataset))}>Start a new search</Button>}>{parsed.error}</Alert>}
    {pageLimitReached && <Alert tone="warning" title="This page is outside your plan" actions={<><Button variant="secondary" onClick={() => run({ ...applied, page: 1 })}>Return to first page</Button><Link to="/billing">Compare plans</Link></>}>Your plan includes up to {maxPage} result pages.</Alert>}
    {accessIssues.length > 0 && <Alert tone="warning" title="Some conditions need different access" actions={<Button variant="secondary" onClick={openEditor}>Edit conditions</Button>}>{accessIssues.join(' ')} <Link to="/billing">Compare plans</Link></Alert>}
    {inputError && !editorOpen && <div id="search-input-error"><Alert tone="error" title="Check your search">{inputError}</Alert></div>}
    {shared && <div className="search-shared-notice"><Icon name="link" size={17} /><p>Shared search · Uses the creator’s access. Host details use your own access.</p><Link to={searchHref(withoutShareToken(applied))}>Start your own search</Link></div>}
    {(appliedFilters.length > 0 || applied.range_filter?.length) ? <div className="search-applied-chips">{appliedFilters.slice(0, 4).map((filter, index) => <button type="button" key={index} disabled={shared} onClick={openEditor} title={filterSummary(filter)}>{filterSummary(filter)}</button>)}{appliedFilters.length > 4 && <button type="button" disabled={shared} onClick={openEditor}>+{appliedFilters.length - 4} conditions</button>}{applied.range_filter?.map((range, index) => <button type="button" key={`range-${index}`} disabled={shared} onClick={openEditor}>{range.field === 'uts' ? 'Observed' : range.field === 'cts' ? 'Created' : range.field} · {['uts', 'cts'].includes(range.field) ? 'Date range' : `${range.start ?? 'Any'}–${range.end ?? 'Any'}`}</button>)}</div> : null}
    {!hasAccess && (parsed.hasSearch || session.status !== 'loading') && (dataset === 'private' ? <Alert tone="info" title="Sign in to view private results"><Link to={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Continue to sign in</Link></Alert> : <SearchAccessNotice />)}
    {canRequest && <>
      <div className="search-workspace-heading">
        <Tabs idPrefix="search-view" ariaLabel="Search views" items={[{ id: 'results', label: 'Results', icon: 'list' }, { id: 'analytics', label: 'Analytics', icon: 'chart' }]} value={view} onChange={changeView} />
        <div className="search-result-actions"><Button variant="ghost" size="sm" className="search-action-link" data-onboarding="save-query" aria-haspopup="dialog" disabled={shared} onClick={() => setSearchAction('save')}><Icon name="bookmark" size={17} /><span>Save</span></Button><Button variant="ghost" size="sm" className="search-action-link" data-onboarding="share-search" aria-haspopup="dialog" disabled={shared} onClick={() => setSearchAction('share')}><Icon name="link" size={17} /><span>Share</span></Button><Button variant="ghost" size="sm" data-onboarding="export-search" disabled={shared || previewOnly || results.isFetching || !displayResults?.hosts.length} onClick={() => setExportOpen(true)}><Icon name="download" size={17} /><span>Export</span></Button></div>
      </div>
      <TabPanel idPrefix="search-view" value="results" hidden={view !== 'results'} className="search-results-panel">
        <div className="search-result-toolbar"><div className="search-result-count"><h1>{displayResults ? `${displayResults.hosts.length.toLocaleString()} ${displayResults.hosts.length === 1 ? 'host' : 'hosts'} returned` : previewOnly ? 'Search results' : results.isPending ? 'Searching hosts' : 'Search results'}</h1><span>{results.isFetching && displayResults ? <Spinner label="Updating results" /> : `Page ${page}`}</span></div><div className="search-result-controls">
          <div className="search-result-select"><span>Sort</span><SelectControl aria-label="Sort" value={sortValue} disabled={shared || previewOnly || results.isFetching || queryDirty} title={queryDirty ? 'Apply or cancel changes first' : undefined} onChange={event => { const [sort_field, sort_direction] = event.target.value.split(':'); run({ ...applied, sort_field, sort_direction, page: 1 }, true); }}><option value="uts:desc">Newest observation</option><option value="uts:asc">Oldest observation</option><option value="ip:asc">Address ascending</option><option value="ip:desc">Address descending</option>{!['uts:desc', 'uts:asc', 'ip:asc', 'ip:desc'].includes(sortValue) && <option value={sortValue}>{applied.sort_field} · {applied.sort_direction || 'desc'}</option>}</SelectControl></div>
          <div className="search-result-select"><span>Rows</span><SelectControl aria-label="Rows" value={pageSize} disabled={shared || previewOnly || results.isFetching || queryDirty} title={queryDirty ? 'Apply or cancel changes first' : undefined} onChange={event => run({ ...applied, docs_per_page: Number(event.target.value), page: 1 }, true)}>{[10, 20, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}{![10, 20, 25, 50].includes(pageSize) && <option value={pageSize}>{pageSize}</option>}</SelectControl></div>
        </div></div>
        {results.isPlaceholderData && !previewOnly && <p className="search-inline-status" role="status">Updating · Previous results remain visible.</p>}
        {results.error && !previewOnly && <Alert tone="error" title={displayResults ? 'Results could not be refreshed' : 'Search could not be completed'} actions={<Button variant="secondary" onClick={() => void results.refetch()}>Try again</Button>}>{results.error.message}</Alert>}
        {Boolean(displayResults && (displayResults.omittedCount || displayResults.incompleteCount)) && <details className="search-data-note"><summary>Some returned data is incomplete</summary><p>{displayResults!.omittedCount ? `${displayResults!.omittedCount} records without a usable address could not be shown. ` : ''}{displayResults!.incompleteCount ? 'Invalid fields have been left blank.' : ''}</p></details>}
        {Boolean(restriction?.hidden_fields?.length || restriction?.hidden_labels?.length) && <details className="search-data-note"><summary>Some details require a different plan</summary><p>{restriction?.hidden_fields?.length ? `Fields: ${restriction.hidden_fields.join(', ')}. ` : ''}{restriction?.hidden_labels?.length ? `Labels: ${restriction.hidden_labels.join(', ')}. ` : ''}<Link to="/billing">View plans</Link></p></details>}
        <div className="search-results-list" data-onboarding="search-results" data-ready={results.isSuccess && !results.isFetching && !previewOnly && !queryDirty ? 'true' : 'false'} aria-busy={results.isFetching}>
          <div className="search-results-columns" aria-hidden="true"><span>Host / network</span><span>Services</span><span>Location</span><span>Last observed</span></div>
          {displayResults?.hosts.map((host, index) => <ResultRow key={`${host.ip}-${index}`} host={host} request={bodyRequest} dataset={dataset} backTo={results.isPlaceholderData ? searchHref(bodyRequest) : location.pathname + location.search} />)}
          {results.isSuccess && displayResults && !displayResults.hosts.length && <EmptyState title={displayResults.omittedCount ? 'No usable host records' : 'No matching hosts'} description={displayResults.omittedCount ? 'Try another page or refine the search.' : page > 1 ? 'No records were returned on this page.' : 'Try a different query or remove a filter.'} actions={<Button variant="secondary" disabled={shared} onClick={() => { if (page > 1) run({ ...applied, page: page - 1 }, true); else openEditor(); }}>{page > 1 ? 'Previous page' : 'Edit filters'}</Button>} />}
          {previewOnly ? <EmptyState title="Run this search" description="Your conditions are ready. Run the search to load current results using your access." icon={<Icon name="search" size={26} />} actions={<Button onClick={() => run({ ...draft, page })}>Run search<Icon name="arrow" size={16} /></Button>} /> : results.isPending && !displayResults && <Skeleton rows={5} className="search-results-skeleton" label="Loading hosts" />}
        </div>
        {displayResults && !shared && <div className="search-results-footer"><Pagination page={page} pageSize={pageSize} count={displayResults.receivedCount} maxPage={maxPage} disabled={results.isFetching || queryDirty} onPageChange={next => run({ ...applied, page: next }, true)} />{page >= maxPage && <span className="search-plan-limit">{maxPage}-page plan limit · <Link to="/billing">View plans</Link></span>}</div>}
      </TabPanel>
      <TabPanel idPrefix="search-view" value="analytics" hidden={view !== 'analytics'} className="search-analytics-panel"><FacetPanel requestKey={JSON.stringify([principal, dataset, facetRequest])} selectedValues={field => activeFacetValues(draft, field)} facets={analytics.facets} pending={analytics.isFetching} error={analytics.error} onSelect={(field, value) => setDraft(current => toggleFacet(current, field, value))} onRetry={loadAnalytics} disabled={shared || editorOpen} loadDisabled={queryDirty} shared={shared} loaded={analytics.data !== undefined || analytics.facets.length > 0} onLoad={loadAnalytics} /></TabPanel>
    </>}
    <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} query={applied} privateSearch={dataset === 'private'} taskIds={applied.task_ids} shareToken={applied.st || applied.share_token} />
    {searchAction === 'save' && <SaveQueryDialog request={applied} dataset={dataset} onClose={() => setSearchAction(null)} />}
    {searchAction === 'share' && <ShareSearchDialog request={applied} dataset={dataset} onClose={() => setSearchAction(null)} />}
  </div>;
}
