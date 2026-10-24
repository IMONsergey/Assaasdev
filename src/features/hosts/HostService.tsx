import { Alert, Badge, Button, EmptyState, Icon, TabPanel, Tabs } from '../../components/ui';
import { DataValue, Facts, NestedRecord, observationDate, RawResponse } from './HostData';
import { ExposedData, ProductList } from './HostProducts';
import type { ResponseTab, ServiceItem, ServiceTab, WebFileTab } from './model';
import { ServiceViewScope } from './view-state';

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
}

export function ServiceDetails({ service, tab, responseTab, webTab, onTab, onResponseTab, onWebTab, onCopy, onCve }: ServiceDetailsProps) {
  if (!service) return <EmptyState icon={<Icon name="server" />} title="Select a service" description="Choose an observation from the service list." />;
  const record = service.record;
  const products = record.detected_products;
  return <ServiceViewScope.Provider value={service.key}><div className="host-service-detail">
    <header className="host-service-title"><div className="host-service-title-main"><span className="host-service-mark"><Icon name="server" size={22} /></span><div><h2>{record.port ?? 'Unknown port'}{record.protocol && <Badge tone="accent">{record.protocol.toUpperCase()}</Badge>}{record.transport && <span className="host-service-transport">{record.transport.toUpperCase()}</span>}</h2></div>{record.status_code !== undefined && <Badge tone={record.status_code >= 200 && record.status_code < 400 ? 'success' : record.status_code >= 400 ? 'warning' : 'neutral'}>HTTP {record.status_code}</Badge>}</div><p className="host-service-context" title={service.context}>{service.context}</p><span className="host-observed"><Icon name="clock" size={14} />{record.uts === undefined ? 'Observation time not provided' : observationDate(record.uts)}</span></header>
    {service.invalidFields.length > 0 && <Alert tone="warning" title="Some fields are unavailable">Unreadable fields: {service.invalidFields.join(', ')}. Original values remain in the complete record.</Alert>}
    <Tabs idPrefix="host-service" ariaLabel="Service details" value={tab} onChange={value => onTab(value as ServiceTab)} items={[{ id: 'response', label: 'Response', icon: 'code' }, { id: 'tls', label: 'TLS', icon: 'shield' }, { id: 'products', label: 'Products & CVE', icon: 'package', count: products?.length }, { id: 'exposed', label: 'Data', icon: 'database' }, { id: 'web', label: 'Web files', icon: 'files' }]} />
    <TabPanel idPrefix="host-service" value={tab} className="host-service-panel">
      {tab === 'response' && <>
        <div className="host-secondary-facts"><section className="host-fact-panel"><h3>Response details</h3><Facts values={[["Status", record.status], ["HTTP status", record.status_code], ["Page title", record.title], ["Final URL", record.link]]} /></section><section className="host-fact-panel"><div className="host-section-heading"><h3>Products</h3>{Boolean(products?.length) && <Button variant="ghost" size="sm" onClick={() => onTab('products')}>View all<Icon name="chevron-right" size={14} /></Button>}</div>{products === undefined ? <p className="host-caption muted">Product data not provided</p> : !products.length ? <p className="host-caption muted">No detected products returned</p> : <ul className="host-response-products">{products.slice(0, 3).map((product, index) => <li key={index}><Icon name="package" size={16} /><div><strong>{product.product || 'Unnamed product'}</strong><span>{[product.version, product.vendor].filter(Boolean).join(' · ') || 'Version not provided'}</span></div></li>)}{products.length > 3 && <li className="muted">+{products.length - 3} more products</li>}</ul>}</section></div>
        <section className="host-response-content"><Tabs idPrefix="host-response" ariaLabel="Response format" variant="segmented" value={responseTab} onChange={value => onResponseTab(value as ResponseTab)} items={[{ id: 'banner', label: 'Banner' }, { id: 'body', label: 'HTTP body' }, { id: 'headers', label: 'Headers' }]} /><TabPanel idPrefix="host-response" value={responseTab}>{responseTab === 'banner' && <RawResponse title={record.protocol?.toLowerCase().includes('http') ? 'HTTP response' : 'Service response'} content={record.banner} onCopy={onCopy} />}{responseTab === 'body' && <RawResponse title="HTTP body" content={record.body} onCopy={onCopy} />}{responseTab === 'headers' && <section className="host-headers"><div className="host-section-heading"><h3>Response headers</h3></div>{record.headers && Object.keys(record.headers).length ? <DataValue value={record.headers} path="response-headers" /> : <div className="host-unavailable-inline">{record.headers === undefined ? 'Response headers not provided.' : 'No response headers returned.'}</div>}</section>}</TabPanel></section>
        <NestedRecord value={{ redirects: record.redirects, favicon_md5: record.favicon_md5, header_domains: record.header_domains, certificate_domains: record.cert_domains }} path="response-metadata" title="Redirects, fingerprints & domains" />
      </>}
      {tab === 'tls' && <section className="host-fact-panel"><div className="host-section-heading"><h3>TLS certificate</h3><Icon name="shield" size={19} /></div>{record.tls_info && Object.keys(record.tls_info).length ? <DataValue value={record.tls_info} path="tls" /> : <p className="muted">{record.tls_info === undefined ? 'TLS data not provided.' : 'No TLS attributes returned.'}</p>}<div className="host-tls-domains"><Facts values={[["Certificate domains", record.cert_domains]]} /></div></section>}
      {tab === 'products' && <ProductList products={products} onCve={onCve} />}
      {tab === 'exposed' && <ExposedData products={products} />}
      {tab === 'web' && <section className="host-web-files"><Tabs idPrefix="host-web-file" ariaLabel="Web file" variant="segmented" value={webTab} onChange={value => onWebTab(value as WebFileTab)} items={[{ id: 'security', label: 'security.txt' }, { id: 'robots', label: 'robots.txt' }]} /><TabPanel idPrefix="host-web-file" value={webTab}>{webTab === 'security' ? <><section className="host-fact-panel"><Facts values={[["Recognized as security.txt", record.security_txt?.is_security_txt], ["Contacts", record.security_txt?.contacts], ["URL", record.security_txt?.url], ["Endpoint", record.security_txt?.endpoint]]} /></section><RawResponse title="security.txt" content={record.security_txt?.body} onCopy={onCopy} /></> : <><section className="host-fact-panel"><Facts values={[["HTTP status", record.robots_txt?.status_code]]} /></section><RawResponse title="robots.txt" content={record.robots_txt?.body} onCopy={onCopy} /></>}</TabPanel></section>}
    </TabPanel>
    <NestedRecord value={service.rawRecord} path="service-record" title="Complete service record" />
  </div></ServiceViewScope.Provider>;
}
