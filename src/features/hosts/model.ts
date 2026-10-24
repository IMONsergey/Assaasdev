import type { DetectedProduct, DomainMapData, HostDetail, PortRecord } from '../../api';

export interface ServiceItem { key: string; record: PortRecord; receivedIndex: number; context: string; searchText: string; rawRecord: PortRecord; invalidFields: string[] }
export type ServiceOrder = 'received' | 'port-asc' | 'port-desc' | 'newest';
export const serviceContentOptions = [
  ['http', 'HTTP response'], ['tls', 'TLS certificate'], ['products', 'Detected products'],
  ['cve', 'CVE associations'], ['exposed', 'Exposed data'], ['security', 'security.txt'], ['robots', 'robots.txt'],
] as const;
export type ServiceContent = '' | typeof serviceContentOptions[number][0];
export interface ServiceFilters { protocol?: string; content?: ServiceContent; port?: string }
export type HostTab = 'overview' | 'services' | 'dns' | 'whois';
export type ServiceTab = 'response' | 'tls' | 'products' | 'exposed' | 'web';
export type ResponseTab = 'banner' | 'body' | 'headers';
export type WebFileTab = 'security' | 'robots';

/** Old shared URLs remain valid while service-only tabs move inside the workspace. */
export function hostWorkspace(params: URLSearchParams): { tab: HostTab; serviceTab: ServiceTab; responseTab: ResponseTab; webTab: WebFileTab; detailOpen: boolean } {
  const legacy = params.get('tab') || '';
  const serviceTabs: Record<string, ServiceTab> = { services: 'response', http: 'response', tls: 'tls', products: 'products', exposed: 'exposed', security: 'web', robots: 'web' };
  const isServiceTab = Object.hasOwn(serviceTabs, legacy);
  const tab: HostTab = legacy === 'overview' || legacy === 'dns' || legacy === 'whois' ? legacy : isServiceTab || params.has('service') || params.has('port') ? 'services' : 'overview';
  const view = params.get('view');
  const serviceTab = (['response', 'tls', 'products', 'exposed', 'web'].includes(view || '') ? view : isServiceTab ? serviceTabs[legacy] : 'response') as ServiceTab;
  const response = params.get('response');
  const responseTab = (['banner', 'body', 'headers'].includes(response || '') ? response : legacy === 'http' ? 'body' : 'banner') as ResponseTab;
  const file = params.get('file');
  const webTab = (file === 'security' || file === 'robots' ? file : legacy === 'robots' ? 'robots' : 'security') as WebFileTab;
  return { tab, serviceTab, responseTab, webTab, detailOpen: params.get('panel') === 'details' || (params.get('panel') !== 'list' && (params.has('service') || params.has('port') || (isServiceTab && legacy !== 'services'))) };
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function normalizeProducts(value: unknown, invalidFields: string[]): DetectedProduct[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) { invalidFields.push('detected_products'); return undefined; }
  let invalid = false;
  const products = value.filter(product => { if (!isRecord(product)) { invalid = true; return false; } return true; }).map(product => {
    const normalized = { ...product } as DetectedProduct;
    for (const key of ['product', 'version', 'vendor', 'cve_product', 'cve_vendor', 'cve_identifier'] as const) {
      if (normalized[key] !== undefined && typeof normalized[key] !== 'string') { invalid = true; delete normalized[key]; }
    }
    if (product.labels !== undefined) {
      normalized.labels = Array.isArray(product.labels) ? product.labels.filter((label: unknown): label is string => typeof label === 'string') : undefined;
      if (!Array.isArray(product.labels) || normalized.labels?.length !== product.labels.length) invalid = true;
    }
    if (product.cve_list !== undefined) {
      if (!Array.isArray(product.cve_list)) { invalid = true; delete normalized.cve_list; }
      else normalized.cve_list = product.cve_list.filter((cve: unknown): cve is Record<string, unknown> => { if (!isRecord(cve)) { invalid = true; return false; } return true; }).map((cve: Record<string, unknown>) => {
        const cve_id = typeof cve.cve_id === 'string' ? cve.cve_id : undefined;
        const base_score = typeof cve.base_score === 'number' && Number.isFinite(cve.base_score) && cve.base_score >= 0 && cve.base_score <= 10 ? cve.base_score : undefined;
        if ((cve.cve_id !== undefined && cve_id === undefined) || (cve.base_score !== undefined && base_score === undefined)) invalid = true;
        return { cve_id, base_score };
      });
    }
    if (product.exposed_data !== undefined && !isRecord(product.exposed_data)) { invalid = true; delete normalized.exposed_data; }
    return normalized;
  });
  if (invalid) invalidFields.push('detected_products');
  return value.length > 0 && products.length === 0 ? undefined : products;
}

export function portRange(value: string): { start: number; end: number } | undefined {
  const match = value.trim().match(/^(\d{1,5})(?:\s*[-–]\s*(\d{1,5}))?$/);
  if (!match) return undefined;
  const start = Number(match[1]), end = Number(match[2] ?? match[1]);
  return start <= end && end <= 65535 ? { start, end } : undefined;
}

export function serviceHasContent(record: PortRecord, content: ServiceContent): boolean {
  const products = Array.isArray(record.detected_products) ? record.detected_products : [];
  if (content === 'http') return record.body !== undefined || record.headers !== undefined || record.status_code !== undefined;
  if (content === 'tls') return Boolean(record.tls_info && Object.keys(record.tls_info).length);
  if (content === 'products') return products.length > 0;
  if (content === 'cve') return products.some(product => Array.isArray(product?.cve_list) && product.cve_list.length > 0);
  if (content === 'exposed') return products.some(product => Array.isArray(product?.exposed_data?.field_value) && product.exposed_data.field_value.length > 0);
  if (content === 'security') return Boolean(record.security_txt?.is_security_txt || record.security_txt?.body !== undefined);
  if (content === 'robots') return record.robots_txt?.body !== undefined;
  return true;
}

export function displayValue(value: unknown): string {
  if (value === undefined) return 'Not provided';
  if (value === null) return 'No value returned';
  if (value === '') return 'Empty value';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join(' · ') : 'None returned';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function serviceContext(record: PortRecord): string {
  const name = record.tls_info?.server_name;
  return [name, record.link, record.title, ...(Array.isArray(record.cert_domains) ? record.cert_domains : [])].find((value): value is string => typeof value === 'string' && Boolean(value)) || 'Context not observed';
}

/** A UI identity for received records, not a fabricated server record ID. */
export function serviceItems(records: PortRecord[]): ServiceItem[] {
  const occurrences = new Map<string, number>();
  return (Array.isArray(records) ? records : []).filter((record): record is PortRecord => Boolean(record && typeof record === 'object' && !Array.isArray(record))).map((rawRecord, receivedIndex) => {
    const record = { ...rawRecord }, invalidFields: string[] = [];
    for (const field of ['port', 'uts', 'status_code'] as const) {
      if (record[field] !== undefined && (typeof record[field] !== 'number' || !Number.isFinite(record[field]) || (field === 'port' && (!Number.isInteger(record[field]) || record[field]! < 0 || record[field]! > 65535)))) { invalidFields.push(field); delete record[field]; }
    }
    for (const field of ['protocol', 'transport', 'banner', 'body', 'status', 'title', 'link', 'favicon_md5', 'banner_sha256', 'body_sha256'] as const) {
      if (record[field] !== undefined && typeof record[field] !== 'string') { invalidFields.push(field); delete record[field]; }
    }
    record.detected_products = normalizeProducts(rawRecord.detected_products, invalidFields);
    for (const field of ['tls_info', 'headers', 'security_txt', 'robots_txt'] as const) {
      if (record[field] !== undefined && !isRecord(record[field])) { invalidFields.push(field); delete record[field]; }
    }
    if (record.security_txt) {
      record.security_txt = { ...record.security_txt };
      for (const field of ['body', 'url', 'endpoint'] as const) if (record.security_txt[field] !== undefined && typeof record.security_txt[field] !== 'string') { invalidFields.push(`security_txt.${field}`); delete record.security_txt[field]; }
    }
    if (record.robots_txt) {
      record.robots_txt = { ...record.robots_txt };
      if (record.robots_txt.body !== undefined && typeof record.robots_txt.body !== 'string') { invalidFields.push('robots_txt.body'); delete record.robots_txt.body; }
    }
    const identity = JSON.stringify([record.port ?? null, record.transport ?? null, record.protocol ?? null, serviceContext(record), record.uts ?? null]);
    const occurrence = occurrences.get(identity) || 0;
    occurrences.set(identity, occurrence + 1);
    return { key: `${identity}#${occurrence}`, record, rawRecord, invalidFields, receivedIndex, context: serviceContext(record), searchText: JSON.stringify(rawRecord).toLocaleLowerCase() };
  });
}

export function filterServices(items: ServiceItem[], filter: string, order: ServiceOrder, filters: ServiceFilters = {}): ServiceItem[] {
  const query = filter.trim().toLocaleLowerCase();
  const range = filters.port?.trim() ? portRange(filters.port) : undefined;
  const matches = items.filter(({ record, searchText }) =>
    (!query || searchText.includes(query)) &&
    (!filters.protocol || String(record.protocol || '').trim().toLocaleLowerCase() === filters.protocol.trim().toLocaleLowerCase()) &&
    (!filters.content || serviceHasContent(record, filters.content)) &&
    (!filters.port?.trim() || Boolean(range && record.port !== undefined && record.port >= range.start && record.port <= range.end)));
  if (order === 'port-asc') matches.sort((a, b) => (a.record.port ?? Infinity) - (b.record.port ?? Infinity) || a.receivedIndex - b.receivedIndex);
  if (order === 'port-desc') matches.sort((a, b) => (b.record.port ?? -Infinity) - (a.record.port ?? -Infinity) || a.receivedIndex - b.receivedIndex);
  if (order === 'newest') matches.sort((a, b) => (b.record.uts ?? -Infinity) - (a.record.uts ?? -Infinity) || a.receivedIndex - b.receivedIndex);
  return matches;
}

export function servicePage(items: ServiceItem[], requestedPage: number, size = 25) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.max(1, Math.min(Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1, totalPages));
  const start = (page - 1) * size;
  return { page, totalPages, rows: items.slice(start, start + size), start: items.length ? start + 1 : 0, end: Math.min(start + size, items.length) };
}

export function hostLocation(host: HostDetail): string {
  const country = host.country_name || host.country_code;
  return [...new Set([host.city_name, host.region, country].filter(Boolean))].join(', ') || 'Not observed';
}

export function mappedDomains(map: DomainMapData | undefined): string[] {
  const values = Array.isArray(map) ? map : map ? [map] : [];
  return [...new Set(values.filter(isRecord).map(item => item.d).filter((value): value is string => typeof value === 'string' && !!value.trim()))];
}

export function serviceSummary(items: ServiceItem[], hasServiceList: boolean, receivedCount = items.length) {
  const protocols = new Map<string, number>();
  const products = new Map<string, { key: string; name: string; version?: string; services: Set<string>; service: ServiceItem }>();
  const ports = new Set<number>(), cves = new Set<string>();
  let productRecords = 0, productSections = 0, cveSections = 0;
  for (const item of items) {
    const protocol = item.record.protocol?.trim().toLowerCase() || '';
    protocols.set(protocol, (protocols.get(protocol) || 0) + 1);
    if (item.record.port !== undefined) ports.add(item.record.port);
    if (Array.isArray(item.record.detected_products)) productSections++;
    for (const product of item.record.detected_products || []) {
      productRecords++;
      const name = product.product?.trim() || 'Unnamed product';
      const key = JSON.stringify([name, product.version || '', product.vendor || '']);
      const existing = products.get(key);
      if (existing) existing.services.add(item.key);
      else products.set(key, { key, name, version: product.version, services: new Set([item.key]), service: item });
      if (Array.isArray(product.cve_list)) cveSections++;
      for (const cve of product.cve_list || []) if (cve.cve_id?.trim()) cves.add(cve.cve_id.trim().toUpperCase());
    }
  }
  const empty = hasServiceList && receivedCount === 0;
  return {
    services: hasServiceList && (empty || items.length > 0) ? items.length : undefined,
    ports: empty || ports.size ? ports.size : undefined,
    productRecords: empty || productSections ? productRecords : undefined,
    cves: empty || cveSections || (productSections > 0 && productRecords === 0) ? cves.size : undefined,
    productSections,
    protocols: [...protocols].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    products: [...products.values()].map(product => ({ ...product, count: product.services.size })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

export function safeBackPath(value: string | null, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return fallback;
  try { const url = new URL(value, 'https://local.invalid'); return url.origin === 'https://local.invalid' && ['/search', '/private/search'].includes(url.pathname) ? `${url.pathname}${url.search}` : fallback; } catch { return fallback; }
}
