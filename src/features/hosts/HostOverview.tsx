import { useMemo } from 'react';
import type { HostDetail } from '../../api';
import { Badge, Button, Icon } from '../../components/ui';
import { TechnologyMark, ProtocolMark } from '../../components/TechnologyMark';
import { CountryFlag } from '../../components/CountryFlag';
import { DataValue, Facts, NestedRecord, observationDate } from './HostData';
import { hostLocation, serviceSummary, type ServiceContent, type ServiceItem } from './model';

interface OverviewProps {
  data: HostDetail | undefined;
  items: ServiceItem[];
  taskIds?: string[];
  onServices: (options?: { protocol?: string; content?: ServiceContent; service?: ServiceItem; view?: 'response' | 'products' }) => void;
}

export function HostOverview({ data, items, onServices, taskIds }: OverviewProps) {
  const hasServiceList = Array.isArray(data?.ports);
  const receivedCount = Array.isArray(data?.ports) ? data.ports.length : 0;
  const summary = useMemo(() => serviceSummary(items, hasServiceList, receivedCount), [items, hasServiceList, receivedCount]);
  const metrics = [
    { label: 'Services', value: summary.services, icon: 'server', caption: receivedCount > items.length ? 'Readable observations' : 'Received observations', action: () => onServices() },
    { label: 'Ports', value: summary.ports, icon: 'grid', caption: 'Distinct identified ports', action: () => onServices() },
    { label: 'Product records', value: summary.productRecords, icon: 'package', caption: summary.productSections ? `Across ${summary.productSections.toLocaleString()} service ${summary.productSections === 1 ? 'record' : 'records'}` : 'Detected technologies', action: () => onServices({content:'products',view:'products'}) },
    { label: 'CVE IDs', value: summary.cves, icon: 'shield', caption: 'Reported associations', action: () => onServices({content:'cve',view:'products'}) },
  ];
  return <div className="host-overview">
    <div className="host-overview-heading"><div><h2>At a glance</h2></div><Button variant="secondary" size="sm" onClick={() => onServices()}>Explore services<Icon name="arrow" size={16} /></Button></div>
    <div className="host-metrics">{metrics.map(metric => <button type="button" className="host-metric" key={metric.label} aria-label={`View ${metric.label.toLowerCase()} in the service catalog`} disabled={metric.value === undefined || metric.value === 0} onClick={metric.action}><span className="host-metric-label"><span>{metric.label}</span><Icon name={metric.icon} size={18} /></span><strong>{metric.value === undefined ? '—' : metric.value.toLocaleString()}</strong><small>{metric.value === undefined ? 'Not provided' : metric.caption}<Icon name="chevron-right" size={14} /></small></button>)}</div>
    {data && <div className="host-attributes"><div><span>Network</span><strong>{data.asn === undefined || data.asn === null ? <DataValue value={data.asn} /> : `AS${data.asn}`}</strong><small><DataValue value={data.as_cidr} /></small></div><div><span>Organization</span><strong className="host-attribute-mark"><TechnologyMark name={data.org} kind="provider" size={19} /><DataValue value={data.org} /></strong><small className="host-attribute-mark"><TechnologyMark name={data.os} kind="os" size={15} /><DataValue value={data.os} /></small></div><div><span>Location</span><strong className="host-location"><CountryFlag code={typeof data.country_code === 'string' ? data.country_code : undefined} />{hostLocation(data)}</strong><small><DataValue value={data.continent_name} /></small></div></div>}
    <div className="host-overview-grid">
      <section className="host-overview-card" aria-label="Protocol distribution"><div className="host-section-heading"><h3>Protocol distribution</h3><span className="host-caption muted">{summary.services === undefined ? 'Unavailable' : `${summary.services.toLocaleString()} services`}</span></div>
        {summary.protocols.length ? <div className="host-protocols">{summary.protocols.slice(0, 6).map(protocol => <div className="host-protocol" key={protocol.name || 'unknown'}>{protocol.name ? <button type="button" onClick={() => onServices({ protocol: protocol.name })}><span className="host-protocol-name"><ProtocolMark protocol={protocol.name} size={16} />{protocol.name.toUpperCase()}</span><strong>{protocol.count.toLocaleString()}</strong></button> : <div><span>Protocol not provided</span><strong>{protocol.count.toLocaleString()}</strong></div>}<div className="host-protocol-track" aria-hidden="true"><span style={{ width: `${protocol.count / items.length * 100}%` }} /></div></div>)}</div> : <p className="host-overview-empty">{hasServiceList ? receivedCount ? 'No readable service records.' : 'No services returned.' : 'Service data not provided.'}</p>}
        {summary.protocols.length > 6 && <Button variant="ghost" size="sm" onClick={() => onServices()}>All {summary.protocols.length} protocols<Icon name="chevron-right" size={15} /></Button>}
      </section>
      <section className="host-overview-card" aria-label="Detected technologies"><div className="host-section-heading"><h3>Detected technologies</h3>{summary.products.length > 0 && <Button variant="ghost" size="sm" onClick={() => onServices({ content: 'products', view: 'products' })}>View services<Icon name="chevron-right" size={15} /></Button>}</div>
        {summary.products.length ? <div className="host-technology-list">{summary.products.slice(0, 5).map(product => <button type="button" key={product.key} onClick={() => onServices({ service: product.service, view: 'products' })}><span className="host-product-mark"><TechnologyMark name={product.name} size={24} /></span><span className="host-technology-name"><strong>{product.name}</strong>{product.version && <small>{product.version}</small>}</span><span className="host-technology-count">{product.count} {product.count === 1 ? 'service' : 'services'}</span><Icon name="chevron-right" size={15} /></button>)}{summary.products.length > 5 && <span className="host-caption muted">+{summary.products.length - 5} more technologies in service records</span>}</div> : <p className="host-overview-empty">{summary.productRecords === undefined ? 'Product data not provided.' : 'No detected products returned.'}</p>}
      </section>
    </div>
    <section className="host-observation"><div className="host-section-heading"><h3>Observation details</h3>{data?.type && <Badge><DataValue value={data.type} /></Badge>}</div><Facts values={[["First observed", observationDate(data?.cts)], ["Last observed", observationDate(data?.uts)], ["Labels", data?.labels_list], ...(taskIds ? [["Task scope", taskIds] as [string, unknown]] : [])]} /></section>
    {data && <NestedRecord value={data} path="host-record" title="Complete host record" />}
  </div>;
}
