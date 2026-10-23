import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { DetectedProduct, PortRecord, SearchRequest } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Icon, Pagination, Spinner, Tabs } from '../../components/ui';
import { ExportDialog } from '../files/ExportDialog';
import { SearchAccessNotice } from '../search/SearchPage';
import { dateLabel, decodeSearch, encodeSearch, isShared, queryLabel, safeExternalUrl, searchPath, withoutShareToken, type Dataset } from '../search/model';
import { displayValue, filterServices, hostLocation, mappedDomains, safeBackPath, serviceItems, servicePage, type ServiceItem, type ServiceOrder } from './model';
import { useHost, type HostSection, type HostSections } from './useHost';
import './hosts.css';

function DataValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === undefined || value === null || value === '') return <span className="muted">{displayValue(value)}</span>;
  if (typeof value === 'boolean' || typeof value === 'number') return <>{displayValue(value)}</>;
  if (typeof value === 'string') {
    const url = safeExternalUrl(value);
    return url ? <a href={url} target="_blank" rel="noopener noreferrer nofollow">{value}<span className="host-sr-only"> (opens in a new tab)</span></a> : <span className="host-text-value">{value}</span>;
  }
  if (depth > 3) return <pre className="host-json">{JSON.stringify(value, null, 2)}</pre>;
  if (Array.isArray(value)) return <DataArray values={value} depth={depth} />;
  if (typeof value === 'object') return <dl className="host-data-grid">{Object.entries(value).map(([key, child]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd><DataValue value={child} depth={depth + 1} /></dd></div>)}</dl>;
  return <>{String(value)}</>;
}

function DataArray({ values, depth }: { values: unknown[]; depth: number }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [values]);
  const size = 50, current = Math.min(page, Math.max(1, Math.ceil(values.length / size)));
  const visible = values.slice((current - 1) * size, current * size);
  if (!values.length) return <span className="muted">None returned</span>;
  return <div className="host-data-array"><ul className="host-data-list">{visible.map((item, index) => <li key={(current - 1) * size + index}><DataValue value={item} depth={depth + 1} /></li>)}</ul>{values.length > size && <Pagination page={current} pageSize={size} count={visible.length} total={values.length} onPageChange={setPage} />}</div>;
}

function Facts({ values }: { values: [string, unknown][] }) {
  return <dl className="host-facts">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><DataValue value={value} /></dd></div>)}</dl>;
}

function RawResponse({ title, content, onCopy }: { title: string; content: string | undefined; onCopy: (value: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  useEffect(() => { setExpanded(false); setFullOpen(false); }, [content]);
  const long = (content?.length || 0) > 4000;
  return <section className="host-raw-response"><div className="host-section-heading"><h2>{title}</h2><div className="cluster"><Button variant="secondary" size="sm" disabled={content === undefined} onClick={() => { if (content !== undefined) onCopy(content); }}><Icon name="copy" size={16} />Copy</Button><Button variant="secondary" size="sm" disabled={content === undefined} onClick={() => setFullOpen(true)}>Full response<Icon name="external" size={16} /></Button></div></div>{content === undefined ? <div className="host-unavailable-inline">No {title.toLowerCase()} was returned for this service.</div> : <><pre className="host-banner"><code>{content === '' ? 'The returned response is empty.' : long && !expanded ? content.slice(0, 4000) : content}</code></pre>{long && <div className="host-truncation"><span>{expanded ? `${content.length.toLocaleString()} characters shown` : `First 4,000 of ${content.length.toLocaleString()} characters`}</span><Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse' : 'Show all received text'}</Button></div>}</>}<Dialog open={fullOpen} onClose={() => setFullOpen(false)} title={title} size="lg" footer={<Button variant="secondary" onClick={() => { if (content !== undefined) onCopy(content); }}>Copy full text</Button>}><p className="muted">Received text is displayed without executing HTML or scripts.</p><pre className="host-banner host-banner-full"><code>{content}</code></pre></Dialog></section>;
}

function ProductList({ products, onCve }: { products: DetectedProduct[] | undefined; onCve: (id: string) => void }) {
  if (!products?.length) return <p className="muted">No detected product records were returned for this service.</p>;
  return <div className="host-products">{products.map((product, index) => <article className="host-product" key={`${product.product}-${product.version}-${index}`}><div className="host-product-heading"><h3>{product.product || 'Unnamed product'}</h3>{product.version && <Badge>{product.version}</Badge>}</div><Facts values={[["Vendor", product.vendor], ["CVE product", product.cve_product], ["CVE vendor", product.cve_vendor], ["Identifier", product.cve_identifier]]} />{product.labels?.length ? <div className="cluster">{product.labels.map((label, i) => <Badge key={`${label}-${i}`}>{label}</Badge>)}</div> : null}{product.cve_list?.length ? <div className="host-cve-chips">{product.cve_list.map((cve, i) => <Button key={`${cve.cve_id}-${i}`} variant="secondary" size="sm" disabled={!cve.cve_id} onClick={() => { if (cve.cve_id) onCve(cve.cve_id); }}>{cve.cve_id || 'CVE identifier not provided'}{cve.base_score !== undefined && <Badge tone={cve.base_score >= 7 ? 'error' : cve.base_score >= 4 ? 'warning' : 'neutral'}>{cve.base_score.toFixed(1)}</Badge>}</Button>)}</div> : <p className="muted host-caption">No CVE associations were returned for this product.</p>}</article>)}</div>;
}

function ExposedProductData({ product, index }: { product: DetectedProduct; index: number }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [product.exposed_data]);
  const rows = product.exposed_data?.field_value || [];
  const pageSize = 50, current = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);
  const title = product.product || `Product ${index + 1}`;
  return <section><h2 className="section-title">{title}</h2>{rows.length > 0 ? <><p className="host-caption muted">{rows.length.toLocaleString()} received rows · Pages use data already loaded.</p><div className="table-wrap" role="region" aria-label={`${title} exposed data`} tabIndex={0}><table className="data-table"><thead><tr>{product.exposed_data?.field_headers?.map((header, i) => <th key={i}>{header}</th>)}</tr></thead><tbody>{visible.map((row, i) => <tr key={(current - 1) * pageSize + i}>{row.map((cell, j) => <td key={j}><DataValue value={cell} /></td>)}</tr>)}</tbody></table></div>{rows.length > pageSize && <Pagination page={current} pageSize={pageSize} count={visible.length} total={rows.length} onPageChange={setPage} />}</> : <p className="muted">No rows were returned.</p>}</section>;
}

function ExposedData({ products }: { products: DetectedProduct[] | undefined }) {
  const populated = products?.filter(product => product.exposed_data) || [];
  if (!populated.length) return <EmptyState title="No exposed-data record returned" description="This does not confirm that the service is safe or has no exposed data. Availability depends on the observation and your access." />;
  return <div className="stack">{populated.map((product, index) => <ExposedProductData key={index} product={product} index={index} />)}</div>;
}

function SectionState({ section, sections, loading, error, retry, children }: { section: HostSection; sections: HostSections; loading: boolean; error: Error | null; retry: () => void; children: ReactNode }) {
  if (sections.errors[section]) return <Alert tone="error" title="This section could not be read" actions={<Button variant="secondary" onClick={retry}>Reload host</Button>}>{sections.errors[section]}</Alert>;
  if (!sections.received.includes(section)) return loading ? <Spinner label={`Loading ${section === 'host' ? 'host details' : section}`} /> : <Alert tone="warning" title="This section has not been received" actions={<Button variant="secondary" onClick={retry}>Reload host</Button>}>{error?.message || 'The server response did not include this section.'} Reloading requests the host again using your access.</Alert>;
  return <>{children}</>;
}

function CveDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { api, user, session } = useApp();
  const query = useQuery({ queryKey: ['cve', user?.user_id || session.status, id], enabled: Boolean(id), staleTime: Infinity, queryFn: async ({ signal }) => {
    const frame = await api.request<Record<string, unknown>>('cveinfo', { cve_ID: id }, { signal });
    if (!frame.data || typeof frame.data !== 'object') throw new Error('The server did not return a CVE document.');
    return frame.data;
  } });
  return <Dialog open={id !== null} onClose={onClose} title={id || 'CVE details'} size="lg">{query.isPending && <Spinner label="Loading CVE details" />}{query.error && <Alert tone="error" actions={<Button variant="secondary" onClick={() => void query.refetch()}>Try again</Button>}>{query.error.message}</Alert>}{query.data && (!query.data.cve_id ? <EmptyState title="No cached CVE document" description="The identifier is associated with the product, but the server returned no CVE details." /> : <><p className="host-cve-description">{displayValue(query.data.description)}</p><Facts values={[["Published", query.data.published], ["Last modified", query.data.lastModified], ["Status", query.data.vulnStatus], ["Source", query.data.sourceIdentifier], ["Last updated", query.data.last_updated]]} />{['cvssMetricV31', 'cvssMetricV2', 'weaknesses', 'references', 'configurations'].map(key => <details className="host-disclosure" key={key} open={key === 'cvssMetricV31'}><summary>{({ cvssMetricV31: 'CVSS v3.1', cvssMetricV2: 'CVSS v2' } as Record<string, string>)[key] || key}</summary><DataValue value={query.data[key]} /></details>)}</>)}</Dialog>;
}

function ServiceDetails({ service, tab, onCopy, onCve }: { service: ServiceItem | undefined; tab: string; onCopy: (value: string) => void; onCve: (id: string) => void }) {
  if (!service) return <EmptyState title="Select an observed service" description="Choose a received record to inspect its response and metadata." />;
  const record = service.record;
  return <div className="host-service-detail"><div className="host-service-title"><h2>{record.port ?? 'Unknown port'} <span>{[record.transport, record.protocol].filter(Boolean).join(' · ') || 'Protocol not observed'}</span></h2><p>{service.context} · {dateLabel(record.uts)}</p></div>{tab === 'services' && <><RawResponse title={record.protocol?.toLowerCase().includes('http') ? 'HTTP response' : 'Service response'} content={record.banner} onCopy={onCopy} /><div className="host-secondary-facts"><section className="host-fact-panel"><h3>Response details</h3><Facts values={[["Status", record.status], ["HTTP status", record.status_code], ["Title", record.title], ["Transport", record.transport], ["Final URL", record.link]]} /></section><section className="host-fact-panel"><h3>Detected products</h3><ProductList products={record.detected_products} onCve={onCve} /></section></div><details className="host-disclosure"><summary>Response metadata · redirects, fingerprints and domains</summary><Facts values={[["Favicon MD5", record.favicon_md5], ["Redirects", record.redirects], ["Header domains", record.header_domains], ["Certificate domains", record.cert_domains]]} /></details><details className="host-disclosure"><summary>Complete service record</summary><pre className="host-json">{JSON.stringify(record, null, 2)}</pre></details></>}{tab === 'http' && <><RawResponse title="HTTP body" content={record.body} onCopy={onCopy} /><section className="host-fact-panel"><h3>Response headers</h3>{record.headers && Object.keys(record.headers).length ? <DataValue value={record.headers} /> : <p className="muted">No response headers were returned.</p>}</section><Facts values={[["HTTP status", record.status_code], ["Title", record.title], ["Final URL", record.link], ["Redirects", record.redirects], ["Favicon MD5", record.favicon_md5]]} /></>}{tab === 'tls' && <section className="host-fact-panel"><h2>TLS certificate</h2>{record.tls_info && Object.keys(record.tls_info).length ? <DataValue value={record.tls_info} /> : <p className="muted">No TLS record was returned for this service.</p>}<Facts values={[["Certificate domains", record.cert_domains]]} /></section>}{tab === 'products' && <ProductList products={record.detected_products} onCve={onCve} />}{tab === 'exposed' && <ExposedData products={record.detected_products} />}{tab === 'security' && <><Facts values={[["Recognized as security.txt", record.security_txt?.is_security_txt], ["Contacts", record.security_txt?.contacts], ["URL", record.security_txt?.url], ["Endpoint", record.security_txt?.endpoint]]} /><RawResponse title="security.txt" content={record.security_txt?.body} onCopy={onCopy} /></>}{tab === 'robots' && <><Facts values={[["HTTP status", record.robots_txt?.status_code]]} /><RawResponse title="robots.txt" content={record.robots_txt?.body} onCopy={onCopy} /></>}</div>;
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
  const [filter, setFilter] = useState('');
  const [order, setOrder] = useState<ServiceOrder>('received');
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [cve, setCve] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLElement>(null);
  const tabNames = ['services', 'http', 'tls', 'products', 'dns', 'whois', 'exposed', 'security', 'robots'];
  const tab = tabNames.includes(params.get('tab') || '') ? params.get('tab')! : 'services';
  const filtered = useMemo(() => filterServices(items, filter, order), [items, filter, order]);
  const window = servicePage(filtered, page);
  const initialRecord = items.find(item => params.get('service') === item.key) || items.find(item => params.has('port') && item.record.port === Number(params.get('port')) && (!params.has('protocol') || item.record.protocol === params.get('protocol'))) || items[0];
  const selected = params.get('service');
  const service = selected ? items.find(item => item.key === selected) : initialRecord;
  const selectedMissing = Boolean(selected && !service);
  const back = safeBackPath(params.get('back'), `${searchPath(dataset)}${parsed.hasSearch && !parsed.error ? `?${encodeSearch(parsed.request)}` : ''}`);
  const domains = mappedDomains(host.sections.domains);
  useEffect(() => { setFilter(''); setPage(1); setCve(null); }, [identifier, dataset]);
  useEffect(() => { setPage(1); }, [filter, order]);
  useEffect(() => {
    const index = filtered.findIndex(item => item.key === service?.key);
    if (index >= 0) setPage(Math.floor(index / 25) + 1);
  }, [service?.key, items, order]);
  const changeTab = (value: string) => { const next = new URLSearchParams(params); next.set('tab', value); setParams(next, { replace: true }); };
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); toast('Copied to clipboard.', 'success'); } catch { toast('Clipboard access is unavailable. Select and copy the visible text.', 'error'); } };
  const select = (item: ServiceItem) => { const next = new URLSearchParams(params); next.set('service', item.key); next.set('port', String(item.record.port ?? '')); if (item.record.protocol) next.set('protocol', item.record.protocol); else next.delete('protocol'); setParams(next, { replace: true }); if (pickerRef.current && detailRef.current && Math.abs(pickerRef.current.getBoundingClientRect().left - detailRef.current.getBoundingClientRect().left) < 2) requestAnimationFrame(() => { detailRef.current?.focus({ preventScroll: true }); detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }); }); };
  const sectionProps = { sections: host.sections, loading: host.isFetching, error: host.error, retry: () => { void host.refetch(); } };
  const ownParams = new URLSearchParams(encodeSearch(withoutShareToken(parsed.request))); if (params.has('back')) ownParams.set('back', params.get('back')!);
  return <div className="host-page"><Link className="host-back" to={back} state={{ restoreScroll: true }}><Icon name="chevron-left" size={18} />Back to results{parsed.request.full_text_search ? ` · ${queryLabel(parsed.request)}` : ''}</Link><header className="host-identity"><div className="host-identity-row"><div><h1>{data?.ip || identifier}</h1>{domains.length ? <p className="host-domain-names">{domains.join(' · ')}</p> : null}</div><div className="host-identity-actions"><Badge tone="accent">{dataset === 'private' ? 'Private data' : 'Public data'}</Badge><Button variant="secondary" onClick={() => void copy(data?.ip || identifier)}>Copy address<Icon name="copy" size={18} /></Button><Button variant="secondary" disabled={!data || shared} onClick={() => setExportOpen(true)}><Icon name="download" size={18} />Export</Button></div></div>{data && <div className="host-attributes"><div><span>Routing / ASN</span><strong>{data.asn === undefined ? 'Not observed' : `AS${data.asn}`}</strong><small>CIDR · {data.as_cidr || 'Not observed'}</small></div><div><span>Organization</span><strong>{data.org || 'Not observed'}</strong><small>OS · {data.os || 'Not observed'}</small></div><div><span>Location</span><strong>{hostLocation(data)}</strong><small>{data.continent_name || 'Continent not observed'}</small></div></div>}</header>{parsed.error && <Alert tone="error" title="The search context could not be restored">{parsed.error} <Link to={`${location.pathname}`}>Load this address without the query context</Link></Alert>}{shared && <Alert tone="info" title="Use your own access for host details">A limited link is bound to the original search. Loading an individual host changes that request. <Link to={`${location.pathname}?${ownParams}`}>Load host using your own access</Link></Alert>}{params.get('own_access') === '1' && <Alert tone="info">This host is being loaded using your own access. Back returns to the shared search.</Alert>}{!hasAccess && !shared && (dataset === 'private' ? <Alert tone="info" title="Sign in to view private host data"><Link to={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Continue to sign in</Link></Alert> : <SearchAccessNotice />)}{hasAccess && !shared && !parsed.error && <>{host.isFetching && <div className="host-stream-status"><Spinner label={data ? 'Refreshing host sections' : 'Loading host sections'} /><span>Host details, DNS{dataset === 'public' ? ', domain map' : ''} and WHOIS arrive independently.</span></div>}{host.error && <Alert tone="warning" title={host.sections.received.length ? 'Some sections are unavailable' : 'Host details could not be loaded'} actions={<Button variant="secondary" disabled={host.isFetching} onClick={() => void host.refetch()}>Reload host</Button>}>{host.error.message} Received sections remain visible. Reloading requests this host again using your access.</Alert>}{data && Object.keys(data).length === 0 && <Alert tone="info" title="No host record returned">The address has no visible host record for this query and access level. Other sections may still be available.</Alert>}<Tabs value={tab} onChange={changeTab} items={[{ id: 'services', label: 'Services', count: data?.ports?.length }, { id: 'http', label: 'HTTP' }, { id: 'tls', label: 'TLS certificate' }, { id: 'products', label: 'Products & CVE' }, { id: 'dns', label: 'DNS' }, { id: 'whois', label: 'WHOIS' }, { id: 'exposed', label: 'Exposed data' }, { id: 'security', label: 'security.txt' }, { id: 'robots', label: 'robots.txt' }]} /><div className="host-tab-panel" role="tabpanel" aria-label={tab}>{tab === 'dns' ? <div className="stack"><SectionState section="dns" {...sectionProps}><section className="host-fact-panel"><h2>DNS records</h2>{host.sections.dns && Object.keys(host.sections.dns).length ? <><p className="muted">Updated {dateLabel(host.sections.dns.updated_at)}</p><DataValue value={host.sections.dns.records} /></> : <EmptyState title="No DNS data returned" description="No DNS record is available in this response." />}</section></SectionState>{dataset === 'public' && <SectionState section="domains" {...sectionProps}><section className="host-fact-panel"><h2>Domain and IP map</h2>{host.sections.domains ? <DataValue value={host.sections.domains} /> : <p className="muted">No domain map was returned.</p>}</section></SectionState>}</div> : tab === 'whois' ? <SectionState section="whois" {...sectionProps}><section className="host-fact-panel"><h2>WHOIS</h2>{host.sections.whois && Object.keys(host.sections.whois).length ? <DataValue value={host.sections.whois} /> : <EmptyState title="No WHOIS data returned" description="No WHOIS record is available in this response." />}</section></SectionState> : <SectionState section="host" {...sectionProps}><div className="host-services-layout"><aside className="host-service-picker" ref={pickerRef} tabIndex={-1} aria-label="Service list"><div className="host-service-count"><strong>{items.length.toLocaleString()} received services</strong><span>Distinct observations in this response</span></div><Field label="Find a service" placeholder="Port, protocol or context" value={filter} onChange={event => setFilter(event.target.value)} /><label className="host-service-sort">Order<select value={order} onChange={event => setOrder(event.target.value as ServiceOrder)}><option value="received">As received</option><option value="port-asc">Port ascending</option><option value="port-desc">Port descending</option><option value="newest">Newest observation</option></select></label><div className="host-service-window" aria-live="polite">{window.start}–{window.end} of {filtered.length.toLocaleString()}{filter ? ' matching' : ' received'}</div><div className="host-service-rows" role="group" aria-label="Observed services">{window.rows.map(item => <button type="button" key={item.key} className={`host-service-row ${service?.key === item.key ? 'is-selected' : ''}`} aria-pressed={service?.key === item.key} onClick={() => select(item)}><span><strong>{item.record.port ?? 'Unknown'}</strong><em>{[item.record.transport, item.record.protocol].filter(Boolean).join(' / ') || 'Protocol unknown'}</em></span><small title={item.context}>{item.context}</small></button>)}</div>{!filtered.length && <p className="host-service-empty">{items.length ? 'No received services match this filter.' : data?.ports === undefined ? 'A service list was not provided.' : 'No services were returned.'}</p>}{filtered.length > 25 && <nav className="host-service-pagination" aria-label="Received service pages"><Button variant="secondary" size="sm" disabled={window.page <= 1} onClick={() => setPage(window.page - 1)} aria-label="Previous service page"><Icon name="chevron-left" size={16} /></Button><span>{window.page} / {window.totalPages}</span><Button variant="secondary" size="sm" disabled={window.page >= window.totalPages} onClick={() => setPage(window.page + 1)} aria-label="Next service page"><Icon name="chevron-right" size={16} /></Button></nav>}<p className="host-local-note">Filtering and these pages use the already received records.</p></aside><div className="host-detail-container" ref={detailRef} tabIndex={-1} role="region" aria-label="Selected service details"><Button className="host-back-to-services" variant="ghost" size="sm" onClick={() => { pickerRef.current?.focus({ preventScroll: true }); pickerRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }); }}><Icon name="chevron-left" size={16} />Back to service list</Button>{selectedMissing && <Alert tone="info" title="Selection is no longer in this response">Choose a service from the current list.</Alert>}{service && filter && !filtered.some(item => item.key === service.key) && <Alert tone="info">The selected service is outside the current list filter. Its details remain visible.</Alert>}<ServiceDetails service={service} tab={tab} onCopy={value => void copy(value)} onCve={setCve} /></div></div></SectionState>}</div>{data && <details className="host-disclosure host-all-attributes"><summary>All host attributes</summary><Facts values={[["Type", data.type], ["Country", data.country_name], ["Country code", data.country_code], ["Continent", data.continent_name], ["Region", data.region], ["Region code", data.region_code], ["City", data.city_name], ["First observation", data.cts === undefined ? undefined : dateLabel(data.cts)], ["Last observation", data.uts === undefined ? undefined : dateLabel(data.uts)], ["Labels", data.labels_list], ["Task scope", request.task_ids]]} /></details>}</>}<CveDialog id={cve} onClose={() => setCve(null)} /><ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} query={request} privateSearch={dataset === 'private'} taskIds={request.task_ids} /></div>;
}
