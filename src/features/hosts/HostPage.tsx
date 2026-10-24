import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import type { SearchRequest } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, EmptyState, Field, Icon, Skeleton, Spinner, TabPanel, Tabs, SelectControl } from '../../components/ui';
import { TechnologyMark, ProtocolMark } from '../../components/TechnologyMark';
import { ExportDialog } from '../files/ExportDialog';
import { SearchAccessNotice } from '../search/SearchPage';
import { decodeSearch, encodeSearch, isShared, queryLabel, searchPath, withoutShareToken, type Dataset } from '../search/model';
import { filterServices, hostWorkspace, mappedDomains, portRange, safeBackPath, serviceContentOptions, serviceHasContent, serviceItems, serviceSelection, type ServiceContent, type ServiceItem, type ServiceOrder, type ServiceTab } from './model';
import { useHost, type HostSection, type HostSections } from './useHost';
import { DataValue, observationDate } from './HostData';
import { CveDialog } from './HostProducts';
import { HostOverview } from './HostOverview';
import { ServiceDetails } from './HostService';
import './hosts.css';

function SectionState({ section, sections, loading, error, retry, children }: { section: HostSection; sections: HostSections; loading: boolean; error: Error | null; retry: () => void; children: ReactNode }) {
  if (sections.errors[section]) return <Alert tone="error" title="This section could not be read" actions={<Button variant="secondary" onClick={retry}>Reload host</Button>}>{sections.errors[section]}</Alert>;
  if (!sections.received.includes(section)) return loading ? <Skeleton rows={4} className="host-loading" /> : <Alert tone="warning" title="Section unavailable" actions={<Button variant="secondary" onClick={retry}>Reload host</Button>}>{error?.message || 'This section was not included in the response.'}</Alert>;
  return <>{children}</>;
}

export function HostPage() {
  const { identifier = '' } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { user, session, toast } = useApp();
  const dataset: Dataset = location.pathname.startsWith('/private/') ? 'private' : 'public';
  const serializedParams = params.toString();
  const parsed = useMemo(() => decodeSearch(new URLSearchParams(serializedParams)), [serializedParams]);
  const shared = isShared(parsed.request);
  const request = useMemo<SearchRequest>(() => ({ ...withoutShareToken(parsed.request), ip: identifier }), [JSON.stringify(parsed.request), identifier]);
  const hasAccess = session.status === 'authenticated' || (dataset === 'public' && session.status === 'guest');
  const host = useHost(request, dataset, hasAccess && !shared && !parsed.error && Boolean(identifier), user?.user_id || user?.session_id || session.status);
  const data = host.sections.host;
  const items = useMemo(() => serviceItems(data?.ports || []), [data?.ports]);
  const filter = params.get('service_q') || '';
  const protocol = params.get('service_protocol') || '';
  const content = serviceContentOptions.some(([value]) => value === params.get('service_content')) ? params.get('service_content') as ServiceContent : '';
  const portFilter = params.get('service_port') || '';
  const order = (['received', 'port-asc', 'port-desc', 'newest'].includes(params.get('service_order') || '') ? params.get('service_order') : 'received') as ServiceOrder;
  const hasServiceFilters = Boolean(filter || protocol || content || portFilter);
  const [exportOpen, setExportOpen] = useState(false), [cve, setCve] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null), detailRef = useRef<HTMLDivElement>(null), pickerRef = useRef<HTMLElement>(null), rowsRef = useRef<HTMLDivElement>(null);
  const rowScroll = useRef(0);
  const pendingFocus = useRef<{ target: 'details' | 'list'; scroll: boolean } | null>(null);
  const workspace = hostWorkspace(params);
  const { tab, serviceTab, responseTab, webTab, detailOpen } = workspace;
  const filtered = useMemo(() => filterServices(items, filter, order, { protocol, content, port: portFilter }), [items, filter, order, protocol, content, portFilter]);
  const protocols = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) { const name = item.record.protocol?.trim().toLowerCase() || ''; if (name) counts.set(name, (counts.get(name) || 0) + 1); }
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);
  const contentCounts = useMemo(() => serviceContentOptions.map(([value, label]) => ({ value, label, count: items.filter(item => serviceHasContent(item.record, value)).length })), [items]);
  const initialRecord = items.find(item => params.has('port') && /^\d+$/.test(params.get('port') || '') && item.record.port === Number(params.get('port')) && (!params.has('protocol') || item.record.protocol === params.get('protocol')));
  const selected = params.get('service') || initialRecord?.key;
  const { selected: service, selectedIndex, window: serviceWindow } = serviceSelection(filtered, selected, Number(params.get('service_page')) || 1);
  const back = safeBackPath(params.get('back'), `${searchPath(dataset)}${parsed.hasSearch && !parsed.error ? `?${encodeSearch(parsed.request)}` : ''}`);
  const domains = useMemo(() => mappedDomains(host.sections.domains), [host.sections.domains]);
  const address = typeof data?.ip === 'string' && data.ip ? data.ip : identifier;
  useEffect(() => { setCve(null); rowScroll.current = 0; }, [identifier, dataset]);
  useLayoutEffect(() => {
    if (detailRef.current && (workspaceRef.current?.clientWidth || window.innerWidth) > 760) detailRef.current.scrollTop = 0;
  }, [service?.key, serviceTab]);
  useLayoutEffect(() => { if (rowsRef.current) rowsRef.current.scrollTop = rowScroll.current; }, [tab, detailOpen]);
  useLayoutEffect(() => {
    const rows = rowsRef.current, button = rows?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!rows || !button || rows.clientHeight === 0) return;
    const container = rows.getBoundingClientRect(), chosen = button.getBoundingClientRect();
    if (chosen.top < container.top) rows.scrollTop += chosen.top - container.top;
    else if (chosen.bottom > container.bottom) rows.scrollTop += chosen.bottom - container.bottom;
    rowScroll.current = rows.scrollTop;
  }, [service?.key, serviceWindow.page, items, tab, detailOpen]);
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const target = pending.target === 'details' ? detailRef.current : pickerRef.current;
    if (!target || getComputedStyle(target).display === 'none') return;
    pendingFocus.current = null;
    if (pending.scroll) target.scrollIntoView({ behavior: 'instant', block: 'start' });
    target.focus({ preventScroll: true });
  }, [serializedParams, tab, detailOpen, service?.key]);

  const compactWorkspace = () => (workspaceRef.current?.clientWidth || window.innerWidth) <= 760;
  const canonicalService = (next: URLSearchParams) => {
    const current = hostWorkspace(next);
    next.set('tab', 'services'); next.set('view', current.serviceTab); next.set('response', current.responseTab); next.set('file', current.webTab);
  };
  const setSelection = (next: URLSearchParams, item: ServiceItem) => {
    next.set('service', item.key);
    if (item.record.port !== undefined) next.set('port', String(item.record.port)); else next.delete('port');
    if (item.record.protocol) next.set('protocol', item.record.protocol); else next.delete('protocol');
  };
  const updateServiceView = (values: Record<string, string | null>, resetPage = true) => {
    // Browser history already includes earlier control events while React may
    // still be rendering the previous filters or nested tab selection.
    const next = new URLSearchParams(window.location.search);
    for (const [name, value] of Object.entries(values)) { if (value) next.set(name, value); else next.delete(name); }
    const nextOrder = (next.get('service_order') || 'received') as ServiceOrder;
    const nextItems = filterServices(items, next.get('service_q') || '', nextOrder, {
      protocol: next.get('service_protocol') || '', content: (next.get('service_content') || '') as ServiceContent, port: next.get('service_port') || '',
    });
    // Paging selects its first row; filters/sorting retain the selected row only
    // while it remains in the result set. There is never an off-page selection.
    const chosen = resetPage ? serviceSelection(nextItems, next.get('service') || service?.key, 1) : serviceSelection(nextItems, null, Number(next.get('service_page')) || 1);
    next.set('service_page', String(chosen.window.page));
    if (chosen.selected) setSelection(next, chosen.selected);
    else { next.delete('service'); next.delete('port'); next.delete('protocol'); }
    rowScroll.current = 0;
    if (rowsRef.current) rowsRef.current.scrollTop = 0;
    setParams(next, { replace: true });
  };
  const changeTab = (value: string) => { const next = new URLSearchParams(window.location.search); const current = hostWorkspace(next); canonicalService(next); next.set('tab', value); if (!next.has('panel') && current.detailOpen) next.set('panel', 'details'); setParams(next, { replace: true }); };
  const changeServiceTab = (value: ServiceTab) => { const next = new URLSearchParams(window.location.search); canonicalService(next); next.set('view', value); next.set('panel', 'details'); setParams(next, { replace: true }); };
  const changeDetailView = (name: string, value: string) => { const next = new URLSearchParams(window.location.search); canonicalService(next); next.set(name, value); next.set('panel', 'details'); setParams(next, { replace: true }); };
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); toast('Copied to clipboard.', 'success'); return true; } catch { toast('Clipboard access is unavailable. Select and copy the visible text.', 'error'); return false; } };
  const select = (item: ServiceItem, page = serviceWindow.page) => {
    pendingFocus.current = compactWorkspace() ? { target: 'details', scroll: true } : null;
    const next = new URLSearchParams(window.location.search); canonicalService(next); setSelection(next, item); next.set('service_page', String(page)); next.set('panel', 'details'); setParams(next, { replace: true });
  };
  const adjacentService = (direction: -1 | 1) => {
    const nextIndex = selectedIndex + direction, item = filtered[nextIndex];
    if (selectedIndex < 0 || !item) return;
    select(item, Math.floor(nextIndex / 25) + 1);
  };
  const openServices = (options: { protocol?: string; content?: ServiceContent; service?: ServiceItem; view?: ServiceTab } = {}) => {
    const next = new URLSearchParams(window.location.search); canonicalService(next);
    for (const key of ['service_q', 'service_protocol', 'service_content', 'service_port', 'service_page']) next.delete(key);
    if (options.protocol) next.set('service_protocol', options.protocol);
    if (options.content) next.set('service_content', options.content);
    if (options.view) next.set('view', options.view);
    const chosen = options.service || filterServices(items, '', order, { protocol: options.protocol, content: options.content })[0];
    if (chosen) setSelection(next, chosen); else { next.delete('service'); next.delete('port'); next.delete('protocol'); }
    next.set('panel', options.service ? 'details' : 'list'); rowScroll.current = 0;
    pendingFocus.current = { target: options.service ? 'details' : 'list', scroll: compactWorkspace() };
    setParams(next, { replace: true });
  };
  const backToList = () => { const next = new URLSearchParams(window.location.search); next.set('panel', 'list'); pendingFocus.current = { target: 'list', scroll: true }; setParams(next, { replace: true }); };
  const sectionProps = { sections: host.sections, loading: host.isFetching, error: host.error, retry: () => { void host.refetch(); } };
  const ownParams = new URLSearchParams(encodeSearch(withoutShareToken(parsed.request))); if (params.has('back')) ownParams.set('back', params.get('back')!);

  return <div className="host-page" data-onboarding="host" ref={workspaceRef}>
    <Link className="host-back" to={back} state={{ restoreScroll: true }}><Icon name="chevron-left" size={16} />Back to results{parsed.request.full_text_search ? <span>· {queryLabel(parsed.request)}</span> : null}</Link>
    <header className="host-identity"><div className="host-identity-row"><div className="host-identity-main"><div className="host-address"><h1>{address}</h1><Badge tone="accent">{dataset === 'private' ? 'Private data' : 'Public data'}</Badge></div>{domains.length > 0 && <div className="host-domain-names">{domains.slice(0, 2).map(domain => <span key={domain} title={domain}>{domain}</span>)}{domains.length > 2 && <button type="button" onClick={() => changeTab('dns')}>+{domains.length - 2} domains<Icon name="chevron-right" size={14} /></button>}</div>}</div><div className="host-identity-actions"><Button variant="secondary" size="sm" onClick={() => void copy(address)}><Icon name="copy" size={16} />Copy address</Button><Button variant="secondary" size="sm" disabled={!data || shared} onClick={() => setExportOpen(true)}><Icon name="download" size={16} />Export</Button></div></div></header>
    {parsed.error && <Alert tone="error" title="The search context could not be restored">{parsed.error} <Link to={location.pathname}>Load this address without the query context</Link></Alert>}
    {shared && <Alert tone="info" title="Use your own access for host details">A limited link is bound to the original search. <Link to={`${location.pathname}?${ownParams}`}>Load host using your own access</Link></Alert>}
    {params.get('own_access') === '1' && <Alert tone="info">Using your own access. Back returns to the shared search.</Alert>}
    {!hasAccess && !shared && (dataset === 'private' ? <Alert tone="info" title="Sign in to view private host data"><Link to={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Continue to sign in</Link></Alert> : <SearchAccessNotice />)}
    {hasAccess && !shared && !parsed.error && <>
      {host.isFetching && <div className="host-stream-status"><Spinner label={data ? 'Refreshing observation…' : 'Loading observation…'} /></div>}
      {host.error && <Alert tone="warning" title={host.sections.received.length ? 'Some sections are unavailable' : 'Host details could not be loaded'} actions={<Button variant="secondary" disabled={host.isFetching} onClick={() => void host.refetch()}>Reload host</Button>}>{host.error.message}</Alert>}
      {data && Object.keys(data).length === 0 && <Alert tone="info" title="No host record returned">Other sections may still be available.</Alert>}
      <Tabs idPrefix="host-workspace" ariaLabel="Host workspace" value={tab} onChange={changeTab} items={[{ id: 'overview', label: 'Overview', icon: 'grid' }, { id: 'services', label: 'Services', icon: 'server', count: Array.isArray(data?.ports) ? items.length : undefined }, { id: 'dns', label: 'DNS & domains', icon: 'globe' }, { id: 'whois', label: 'WHOIS', icon: 'info' }]} />
      <TabPanel idPrefix="host-workspace" value={tab} className="host-tab-panel">
        {tab === 'overview' && <SectionState section="host" {...sectionProps}><HostOverview data={data} items={items} onServices={openServices} taskIds={request.task_ids} /></SectionState>}
        {tab === 'dns' && <div className="host-dns-layout"><SectionState section="dns" {...sectionProps}><section className="host-record-section"><div className="host-section-heading"><h2>DNS records</h2>{host.sections.dns?.updated_at !== undefined && <span className="host-caption muted">{observationDate(host.sections.dns.updated_at)}</span>}</div>{host.sections.dns && Object.keys(host.sections.dns).length ? <DataValue value={host.sections.dns.records} path="dns" /> : <EmptyState title="No DNS data returned" icon={<Icon name="globe" />} />}</section></SectionState>{dataset === 'public' && <SectionState section="domains" {...sectionProps}><section className="host-record-section"><div className="host-section-heading"><h2>Domain & IP map</h2>{domains.length > 0 && <Badge>{domains.length.toLocaleString()} domains</Badge>}</div>{host.sections.domains ? <DataValue value={host.sections.domains} path="domains" /> : <EmptyState title="No domain map returned" />}</section></SectionState>}</div>}
        {tab === 'whois' && <SectionState section="whois" {...sectionProps}><section className="host-record-section"><div className="host-section-heading"><h2>Registration record</h2></div>{host.sections.whois && Object.keys(host.sections.whois).length ? <DataValue value={host.sections.whois} path="whois" /> : <EmptyState title="No WHOIS data returned" icon={<Icon name="info" />} />}</section></SectionState>}
        {tab === 'services' && <SectionState section="host" {...sectionProps}><div className={`host-services-layout ${detailOpen ? 'is-detail' : 'is-catalog'}`}>
          <aside className="host-service-picker" ref={pickerRef} tabIndex={-1} aria-label="Service list">
            <div className="host-service-count"><h2>Service catalog</h2><span>{Array.isArray(data?.ports) ? items.length.toLocaleString() : '—'}</span></div>
            {Array.isArray(data?.ports) && data.ports.length > items.length && <p className="host-caption muted">{data.ports.length - items.length} unreadable records</p>}
            <Field label="Find a service" className="host-compact-search" placeholder="Port, product or response" icon={<Icon name="search" size={16} />} value={filter} onChange={event => updateServiceView({ service_q: event.target.value })} />
            <details className="host-service-classify" open={Boolean(protocol || content || portFilter) || undefined}><summary><Icon name="plus" size={15} />Classify services{(protocol || content || portFilter) && <span>{[protocol, content, portFilter].filter(Boolean).length}</span>}<Icon name="chevron-down" size={16} /></summary><div className="host-service-filters"><label>Protocol<SelectControl value={protocol} onChange={event => updateServiceView({ service_protocol: event.target.value })}><option value="">All protocols</option>{protocols.map(([name, count]) => <option key={name} value={name}>{name.toUpperCase()} · {count.toLocaleString()}</option>)}{protocol && !protocols.some(([name]) => name === protocol) && <option value={protocol}>{protocol} · 0</option>}</SelectControl></label><label>Contains<SelectControl value={content} onChange={event => updateServiceView({ service_content: event.target.value })}><option value="">Any content</option>{contentCounts.map(item => <option key={item.value} value={item.value}>{item.label} · {item.count.toLocaleString()}</option>)}</SelectControl></label><Field label="Port or range" placeholder="443 or 8000–9000" value={portFilter} onChange={event => updateServiceView({ service_port: event.target.value })} error={portFilter.trim() && !portRange(portFilter) ? 'Use a port or ascending range from 0 to 65535.' : undefined} /></div></details>
            <label className="host-service-sort">Order<SelectControl value={order} onChange={event => updateServiceView({ service_order: event.target.value })}><option value="received">As received</option><option value="port-asc">Port ascending</option><option value="port-desc">Port descending</option><option value="newest">Newest first</option></SelectControl></label>
            <div className="host-service-window" aria-live="polite"><span>{serviceWindow.start}–{serviceWindow.end} of {filtered.length.toLocaleString()}{hasServiceFilters ? ' matching' : ''}</span>{hasServiceFilters && <Button variant="ghost" size="sm" onClick={() => updateServiceView({ service_q: null, service_protocol: null, service_content: null, service_port: null })}>Clear filters</Button>}</div>
            <div className="host-service-rows" ref={rowsRef} onScroll={event => { rowScroll.current = event.currentTarget.scrollTop; }} role="group" aria-label="Observed services">{serviceWindow.rows.map(item => <button type="button" key={item.key} className={`host-service-row ${service?.key === item.key ? 'is-selected' : ''}`} aria-pressed={service?.key === item.key} onClick={() => select(item)}><span className="host-service-row-mark">{item.record.detected_products?.[0]?.product ? <TechnologyMark name={item.record.detected_products[0].product} size={22} /> : <ProtocolMark protocol={item.record.protocol} size={21} />}</span><span className="host-service-row-copy"><span className="host-service-row-top"><strong>{item.record.port ?? 'Unknown port'}</strong><em>{item.record.protocol?.toUpperCase() || item.record.transport?.toUpperCase() || 'Unknown'}</em></span><small title={item.context}>{item.record.detected_products?.some(product => product.product) ? item.record.detected_products.filter(product => product.product).slice(0, 2).map(product => [product.product, product.version].filter(Boolean).join(' ')).join(' · ') : item.context}</small></span><Icon name="chevron-right" size={14} className="host-service-row-arrow" /></button>)}</div>
            {!filtered.length && <div className="host-service-empty"><Icon name="search" size={22} /><p>{!Array.isArray(data?.ports) ? 'Service list not provided.' : items.length ? 'No matching services.' : data.ports.length ? 'No readable service records.' : 'No services returned.'}</p></div>}
            {filtered.length > 25 && <nav className="host-service-pagination" aria-label="Received service pages"><Button variant="secondary" size="sm" disabled={serviceWindow.page <= 1} onClick={() => updateServiceView({ service_page: String(serviceWindow.page - 1) }, false)} aria-label="Previous service page"><Icon name="chevron-left" size={16} /></Button><span>{serviceWindow.page} / {serviceWindow.totalPages}</span><Button variant="secondary" size="sm" disabled={serviceWindow.page >= serviceWindow.totalPages} onClick={() => updateServiceView({ service_page: String(serviceWindow.page + 1) }, false)} aria-label="Next service page"><Icon name="chevron-right" size={16} /></Button>{serviceWindow.totalPages > 5 && <form className="host-service-jump" onSubmit={event => { event.preventDefault(); const input = event.currentTarget.elements.namedItem('servicePage') as HTMLInputElement; const next = Math.max(1, Math.min(serviceWindow.totalPages, Math.trunc(Number(input.value)) || 1)); updateServiceView({ service_page: String(next) }, false); }}><label>Go to page<input key={serviceWindow.page} name="servicePage" type="number" inputMode="numeric" min={1} max={serviceWindow.totalPages} step={1} defaultValue={serviceWindow.page} /></label><Button variant="secondary" size="sm" type="submit">Go</Button></form>}</nav>}
          </aside>
          <div className="host-detail-container" ref={detailRef} tabIndex={-1} role="region" aria-label="Selected service details"><Button className="host-back-to-services" aria-label="Back to service list" variant="ghost" size="sm" onClick={backToList}><Icon name="chevron-left" size={16} />Back to service list<span>{items.length.toLocaleString()}</span></Button>
            {service && <nav className="host-observation-switcher" aria-label="Navigate matching services"><span>{selectedIndex >= 0 ? <>Service <strong>{(selectedIndex + 1).toLocaleString()}</strong> of <strong>{filtered.length.toLocaleString()}</strong>{hasServiceFilters && ' matching'} </> : 'Selected service'}</span><div><Button variant="secondary" size="sm" disabled={selectedIndex <= 0} onClick={() => adjacentService(-1)} aria-label="Previous matching service"><Icon name="chevron-left" size={16} /></Button><Button variant="secondary" size="sm" disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1} onClick={() => adjacentService(1)} aria-label="Next matching service"><Icon name="chevron-right" size={16} /></Button></div></nav>}
            <ServiceDetails key={service?.key} service={service} tab={serviceTab} responseTab={responseTab} webTab={webTab} onTab={changeServiceTab} onResponseTab={value => changeDetailView('response', value)} onWebTab={value => changeDetailView('file', value)} onCopy={copy} onCve={setCve} onDataServices={contentCounts.some(item => item.value === 'exposed' && item.count > 0) ? () => openServices({ content: 'exposed', view: 'exposed' }) : undefined} />
          </div>
        </div></SectionState>}
      </TabPanel>
    </>}
    <CveDialog id={cve} onClose={() => setCve(null)} /><ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} query={request} privateSearch={dataset === 'private'} taskIds={request.task_ids} />
  </div>;
}
