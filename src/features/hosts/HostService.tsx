import { Alert, Badge, Button, EmptyState, Icon, TabPanel, Tabs } from '../../components/ui';
import { TechnologyMark } from '../../components/TechnologyMark';
import { DataValue, Facts, NestedRecord, observationDate, RawResponse } from './HostData';
import { ExposedData, ProductList } from './HostProducts';
import type { ResponseTab, ServiceItem, ServiceTab, WebFileTab } from './model';
import { ServiceViewScope } from './view-state';
import { robotsSummary, securitySummary } from './web-files';

interface ServiceDetailsProps {
  service: ServiceItem | undefined;
  tab: ServiceTab;
  responseTab: ResponseTab;
  webTab: WebFileTab;
  onTab: (value: ServiceTab) => void;
  onResponseTab: (value: ResponseTab) => void;
  onWebTab: (value: WebFileTab) => void;
  onCopy: (value: string) => void;
  onCve: (id: string) => void;
  onDataServices?: () => void;
}

export function ServiceDetails({ service, tab, responseTab, webTab, onTab, onResponseTab, onWebTab, onCopy, onCve, onDataServices }: ServiceDetailsProps) {
  if (!service) return <EmptyState icon={<Icon name="server" />} title="Select a service" description="Choose an observation from the service list." />;
  const record = service.record;
  const products = record.detected_products;
  const webFacts = webTab === 'security' ? securitySummary(record.security_txt) : robotsSummary(record.robots_txt);
  const webBody = webTab === 'security' ? record.security_txt?.body : record.robots_txt?.body;
  const fingerprints: [string, unknown, string?][] = [];
  if (record.favicon_md5) fingerprints.push(["Favicon MD5", record.favicon_md5, "favicon_md5"]);
  if (record.banner_sha256) fingerprints.push(["Banner SHA-256", record.banner_sha256, "banner_sha256"]);
  if (record.body_sha256) fingerprints.push(["Body SHA-256", record.body_sha256, "body_sha256"]);
  return <ServiceViewScope.Provider value={service.key}><div className="host-service-detail">
    <div className="host-detail-navigation"><header className="host-service-title"><div className="host-service-title-main"><span className="host-service-mark">{products?.[0]?.product ? <TechnologyMark name={products[0].product} size={26} /> : <Icon name="server" size={22} />}</span><div><h2>{record.port ?? 'Unknown port'}{record.protocol && <Badge tone="accent">{record.protocol.toUpperCase()}</Badge>}{record.transport && <span className="host-service-transport">{record.transport.toUpperCase()}</span>}</h2></div>{record.status_code !== undefined && <Badge tone={record.status_code >= 200 && record.status_code < 400 ? 'success' : record.status_code >= 400 ? 'warning' : 'neutral'}>HTTP {record.status_code}</Badge>}</div><p className="host-service-context" title={service.context}>{service.context}</p><span className="host-observed"><Icon name="clock" size={14} />{record.uts === undefined ? 'Observation time not provided' : observationDate(record.uts)}</span></header>
    {service.invalidFields.length > 0 && <Alert tone="warning" title="Some fields are unavailable">Unreadable fields: {service.invalidFields.join(', ')}. Original values remain in the complete record.</Alert>}
    <Tabs idPrefix="host-service" ariaLabel="Service details" value={tab} onChange={value => onTab(value as ServiceTab)} items={[{ id: 'response', label: 'Response', icon: 'code' }, { id: 'tls', label: 'TLS', icon: 'shield' }, { id: 'products', label: 'Products & CVE', icon: 'package', count: products?.length }, { id: 'exposed', label: 'Data', icon: 'database' }, { id: 'web', label: 'Web files', icon: 'files' }]} /></div>
    <TabPanel idPrefix="host-service" value={tab} className="host-service-panel">
      {tab === 'response' && <>
        <div className="host-secondary-facts"><section className="host-fact-panel"><h3>Response details</h3><Facts values={[["Protocol", record.protocol, "protocol"], ["Port", record.port, "port"], ["Status", record.status], ["HTTP status", record.status_code, "status_code"], ["Page title", record.title, "title"], ["Final URL", record.link]]} /></section><section className="host-fact-panel"><div className="host-section-heading"><h3>Products</h3>{Boolean(products?.length) && <Button variant="ghost" size="sm" onClick={() => onTab('products')}>View all<Icon name="chevron-right" size={14} /></Button>}</div>{products === undefined ? <p className="host-caption muted">Product data not provided</p> : !products.length ? <p className="host-caption muted">No detected products returned</p> : <ul className="host-response-products">{products.slice(0, 3).map((product, index) => <li key={index}><button type="button" onClick={() => onTab('products')}><TechnologyMark name={product.product} size={22} /><span><strong>{product.product || 'Unnamed product'}</strong><small>{[product.version, product.vendor].filter(Boolean).join(' · ') || 'Version not provided'}</small></span><Icon name="chevron-right" size={14} /></button></li>)}{products.length > 3 && <li className="muted">+{products.length - 3} more products</li>}</ul>}</section></div>
        <section className="host-response-content"><Tabs idPrefix="host-response" ariaLabel="Response format" variant="segmented" value={responseTab} onChange={value => onResponseTab(value as ResponseTab)} items={[{ id: 'banner', label: 'Banner' }, { id: 'body', label: 'HTTP body' }, { id: 'headers', label: 'Headers' }]} /><TabPanel idPrefix="host-response" value={responseTab}>{responseTab === 'banner' && <RawResponse title={record.protocol?.toLowerCase().includes('http') ? 'HTTP response' : 'Service response'} content={record.banner} onCopy={onCopy} />}{responseTab === 'body' && <RawResponse title="HTTP body" content={record.body} onCopy={onCopy} />}{responseTab === 'headers' && <section className="host-headers"><div className="host-section-heading"><h3>Response headers</h3></div>{record.headers && Object.keys(record.headers).length ? <DataValue value={record.headers} path="response-headers" searchField="headers" /> : <div className="host-unavailable-inline">{record.headers === undefined ? 'Response headers not provided.' : 'No response headers returned.'}</div>}</section>}</TabPanel></section>
        {fingerprints.length > 0 && <details className="host-disclosure"><summary><span>Response fingerprints</span><Icon name="chevron-down" size={16} /></summary><Facts values={fingerprints} /></details>}
        <NestedRecord value={{ redirects: record.redirects, header_domains: record.header_domains, certificate_domains: record.cert_domains }} path="response-metadata" title="Redirects, fingerprints & domains" />
      </>}
      {tab === 'tls' && <section className="host-fact-panel"><div className="host-section-heading"><h3>TLS certificate</h3><Icon name="shield" size={19} /></div>{record.tls_info && Object.keys(record.tls_info).length ? <DataValue value={record.tls_info} path="tls" /> : <p className="muted">{record.tls_info === undefined ? 'TLS data not provided.' : 'No TLS attributes returned.'}</p>}<div className="host-tls-domains"><Facts values={[["Certificate domains", record.cert_domains]]} /></div></section>}
      {tab === 'products' && <ProductList products={products} onCve={onCve} />}
      {tab === 'exposed' && <ExposedData products={products} onFindData={onDataServices} />}
      {tab === 'web' && <section className="host-web-files"><Tabs idPrefix="host-web-file" ariaLabel="Web file" variant="segmented" value={webTab} onChange={value => onWebTab(value as WebFileTab)} items={[{ id: 'security', label: 'security.txt' }, { id: 'robots', label: 'robots.txt' }]} /><TabPanel idPrefix="host-web-file" value={webTab}>{webFacts.length > 0 && <section className="host-fact-panel"><h3>{webTab === 'security' ? 'Security contacts & policy' : 'Crawler policy summary'}</h3><Facts values={webFacts} /></section>}{webFacts.length === 0 && webBody === undefined ? <EmptyState icon={<Icon name="files" />} title={`No ${webTab === 'security' ? 'security.txt' : 'robots.txt'} returned`} description="This observation does not include the file. Other services may have a different response." /> : <RawResponse title={webTab === 'security' ? 'security.txt' : 'robots.txt'} content={webBody} onCopy={onCopy} />}</TabPanel></section>}
    </TabPanel>
    <NestedRecord value={service.rawRecord} path="service-record" title="Complete service record" />
  </div></ServiceViewScope.Provider>;
}
