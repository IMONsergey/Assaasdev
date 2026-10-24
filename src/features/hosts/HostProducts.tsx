import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DetectedProduct } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Icon, Pagination, Spinner } from '../../components/ui';
import { DataExplorer } from './DataExplorer';
import { DataValue, Facts } from './HostData';
import { displayValue } from './model';
import { useHostViewState } from './view-state';

const productName = (product: DetectedProduct, index: number) => product.product || `Product ${index + 1}`;

function CveList({ product, index, onCve }: { product: DetectedProduct; index: number; onCve: (id: string) => void }) {
  const [view, update] = useHostViewState(`product-cves-${index}`, { query: '', page: 1 });
  const cves = product.cve_list;
  if (!cves) return <p className="host-caption muted">CVE associations not provided</p>;
  if (!cves.length) return <p className="host-caption muted">No CVE associations returned</p>;
  const query = view.query.trim().toLowerCase();
  const matches = query ? cves.filter(cve => `${cve.cve_id || ''} ${cve.base_score ?? ''}`.toLowerCase().includes(query)) : cves;
  const page = Math.min(view.page, Math.max(1, Math.ceil(matches.length / 12)));
  return <section className="host-cve-list" aria-label={`CVE associations for ${productName(product, index)}`}>
    <div className="host-section-heading"><h4>CVE associations <span>{cves.length.toLocaleString()}</span></h4>{cves.length > 12 && <Field label={`Search CVEs for ${productName(product, index)} (${index + 1})`} className="host-compact-search" value={view.query} placeholder="Find a CVE" icon={<Icon name="search" size={16} />} onChange={event => update({ query: event.target.value, page: 1 })} />}</div>
    <div className="host-cve-chips">{matches.slice((page - 1) * 12, page * 12).map((cve, cveIndex) => <Button key={`${cve.cve_id}-${cveIndex}`} variant="secondary" size="sm" disabled={!cve.cve_id} onClick={() => { if (cve.cve_id) onCve(cve.cve_id); }}>{cve.cve_id || 'Identifier not provided'}{cve.base_score !== undefined && <Badge tone={cve.base_score >= 7 ? 'error' : cve.base_score >= 4 ? 'warning' : 'neutral'}>{cve.base_score.toFixed(1)}</Badge>}</Button>)}</div>
    {!matches.length && <p className="host-caption muted">No matching CVE IDs</p>}
    {matches.length > 12 && <Pagination page={page} pageSize={12} count={Math.min(12, matches.length - (page - 1) * 12)} total={matches.length} onPageChange={next => update({ page: next })} />}
  </section>;
}

export function ProductList({ products, onCve }: { products: DetectedProduct[] | undefined; onCve: (id: string) => void }) {
  const [view, update] = useHostViewState('product-list', { query: '', page: 1 });
  const entries = useMemo(() => (products || []).map((product, index) => ({ product, index, search: [product.product, product.version, product.vendor, product.cve_identifier, product.cve_product, product.cve_vendor, ...(product.labels || []), ...(product.cve_list || []).map(cve => cve.cve_id)].filter(Boolean).join(' ').toLowerCase() })), [products]);
  const query = view.query.trim().toLowerCase();
  const matches = query ? entries.filter(entry => entry.search.includes(query)) : entries;
  const page = Math.min(view.page, Math.max(1, Math.ceil(matches.length / 6)));
  if (products === undefined) return <EmptyState icon={<Icon name="package" />} title="Product data not provided" />;
  if (!products.length) return <EmptyState icon={<Icon name="package" />} title="No detected products returned" />;
  return <section className="host-product-workspace" aria-label="Detected products">
    <div className="host-product-toolbar"><span>{matches.length.toLocaleString()} {query ? `matching of ${products.length.toLocaleString()} products` : `product${products.length === 1 ? '' : 's'}`}</span><Field label="Find a product or CVE" className="host-compact-search" value={view.query} placeholder="Product, vendor or CVE" icon={<Icon name="search" size={16} />} onChange={event => update({ query: event.target.value, page: 1 })} /></div>
    <div className="host-products">{matches.slice((page - 1) * 6, page * 6).map(({ product, index }) => <article className="host-product" key={index}>
      <div className="host-product-heading"><div className="host-product-mark"><Icon name="package" size={19} /></div><div><h3>{productName(product, index)}{product.version && <Badge>{product.version}</Badge>}</h3><p>{product.vendor === undefined ? 'Vendor not provided' : displayValue(product.vendor)}</p></div></div>
      {(product.cve_product !== undefined || product.cve_vendor !== undefined || product.cve_identifier !== undefined) && <Facts values={[["CVE product", product.cve_product], ["CVE vendor", product.cve_vendor], ["Identifier", product.cve_identifier]]} />}
      {product.labels?.length ? <div className="host-product-labels">{product.labels.slice(0, 4).map((label, labelIndex) => <Badge key={labelIndex}>{label}</Badge>)}{product.labels.length > 4 && <details><summary>+{product.labels.length - 4} labels</summary><DataValue value={product.labels} path={`product-${index}-labels`} /></details>}</div> : null}
      <CveList product={product} index={index} onCve={onCve} />
    </article>)}</div>
    {!matches.length && <EmptyState title="No matching products" actions={<Button variant="secondary" size="sm" onClick={() => update({ query: '', page: 1 })}>Clear search</Button>} />}
    {matches.length > 6 && <Pagination page={page} pageSize={6} count={Math.min(6, matches.length - (page - 1) * 6)} total={matches.length} onPageChange={next => update({ page: next })} />}
  </section>;
}

export function ExposedData({ products }: { products: DetectedProduct[] | undefined }) {
  const entries = useMemo(() => (products || []).flatMap((product, index) => product.exposed_data ? [{ product, index, title: productName(product, index) }] : []), [products]);
  const [view, update] = useHostViewState('exposed-datasets', { query: '', page: 1, selected: null as number | null });
  const matches = entries.filter(entry => `${entry.title} ${entry.product.vendor || ''}`.toLowerCase().includes(view.query.trim().toLowerCase()));
  const page = Math.min(view.page, Math.max(1, Math.ceil(matches.length / 6)));
  const selected = entries.find(entry => entry.index === view.selected) || entries[0];
  if (!selected) return <EmptyState icon={<Icon name="database" />} title="No exposed-data record returned" />;
  const data = selected.product.exposed_data;
  const rows = Array.isArray(data?.field_value) ? data.field_value : [];
  const headers = Array.isArray(data?.field_headers) ? data.field_headers : [];
  return <div className="host-datasets">
    {entries.length > 1 && <section className="host-dataset-picker" aria-label="Exposed datasets"><div className="host-product-toolbar"><span>{entries.length.toLocaleString()} datasets</span><Field className="host-compact-search" label="Find a dataset" value={view.query} placeholder="Product or vendor" icon={<Icon name="search" size={16} />} onChange={event => update({ query: event.target.value, page: 1 })} /></div><div className="host-dataset-options">{matches.slice((page - 1) * 6, page * 6).map(entry => <button key={entry.index} type="button" aria-pressed={selected.index === entry.index} onClick={() => update({ selected: entry.index })}><Icon name="database" size={16} /><span>{entry.title}</span><small>{Array.isArray(entry.product.exposed_data?.field_value) ? `${entry.product.exposed_data.field_value.length.toLocaleString()} rows` : 'Rows unavailable'}</small></button>)}</div>{!matches.length && <p className="muted host-caption">No matching datasets</p>}{matches.length > 6 && <Pagination page={page} pageSize={6} count={Math.min(6, matches.length - (page - 1) * 6)} total={matches.length} onPageChange={next => update({ page: next })} />}</section>}
    <section className="host-dataset-content"><div className="host-section-heading"><h3>{selected.title}</h3></div>{Array.isArray(data?.field_value) ? <DataExplorer key={selected.index} values={rows} headers={headers} label={`${selected.title} exposed data`} stateId={`exposed-${selected.index}`} renderValue={(value, row, column) => <DataValue value={value} path={`exposed-${selected.index}.${row}.${column}`} />} /> : <div className="host-unavailable-inline">Rows were not provided for this dataset.</div>}</section>
  </div>;
}

export function CveDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { api, user, session } = useApp();
  const query = useQuery({ queryKey: ['cve', user?.user_id || session.status, id], enabled: Boolean(id), staleTime: Infinity, queryFn: async ({ signal }) => {
    const frame = await api.request<Record<string, unknown>>('cveinfo', { cve_ID: id }, { signal });
    if (!frame.data || typeof frame.data !== 'object') throw new Error('The server did not return a CVE document.');
    return frame.data;
  } });
  return <Dialog open={id !== null} onClose={onClose} title={id || 'CVE details'} size="lg">{query.isPending && <Spinner label="Loading CVE details" />}{query.error && <Alert tone="error" actions={<Button variant="secondary" onClick={() => void query.refetch()}>Try again</Button>}>{query.error.message}</Alert>}{query.data && (!query.data.cve_id ? <EmptyState title="No CVE document returned" /> : <><p className="host-cve-description">{displayValue(query.data.description)}</p><Facts values={[["Published", query.data.published], ["Last modified", query.data.lastModified], ["Status", query.data.vulnStatus], ["Source", query.data.sourceIdentifier], ["Last updated", query.data.last_updated]]} />{['cvssMetricV31', 'cvssMetricV2', 'weaknesses', 'references', 'configurations'].map(key => <details className="host-disclosure" key={key} open={key === 'cvssMetricV31'}><summary>{({ cvssMetricV31: 'CVSS v3.1', cvssMetricV2: 'CVSS v2' } as Record<string, string>)[key] || key}</summary><DataValue value={query.data[key]} path={`cve-${id}-${key}`} /></details>)}</>)}</Dialog>;
}
