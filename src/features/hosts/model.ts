import type { DomainMapData, HostDetail, PortRecord } from '../../api';

export interface ServiceItem { key: string; record: PortRecord; receivedIndex: number; context: string; searchText: string; rawRecord: PortRecord; invalidFields: string[] }
export type ServiceOrder = 'received' | 'port-asc' | 'port-desc' | 'newest';
export const serviceContentOptions = [
  ['http', 'HTTP response'], ['tls', 'TLS certificate'], ['products', 'Detected products'],
  ['cve', 'CVE associations'], ['exposed', 'Exposed data'], ['security', 'security.txt'], ['robots', 'robots.txt'],
] as const;
export type ServiceContent = '' | typeof serviceContentOptions[number][0];
export interface ServiceFilters { protocol?: string; content?: ServiceContent; port?: string }

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
    for (const field of ['protocol', 'transport', 'banner', 'body', 'status', 'title', 'link', 'favicon_md5'] as const) {
      if (record[field] !== undefined && typeof record[field] !== 'string') { invalidFields.push(field); delete record[field]; }
    }
    if (record.detected_products !== undefined && !Array.isArray(record.detected_products)) { invalidFields.push('detected_products'); delete record.detected_products; }
    else if (record.detected_products) {
      const products = record.detected_products.filter(product => Boolean(product && typeof product === 'object' && !Array.isArray(product)));
      if (products.length !== record.detected_products.length) invalidFields.push('detected_products');
      record.detected_products = products.map(product => ({ ...product,
        cve_list: Array.isArray(product.cve_list) ? product.cve_list.filter(cve => Boolean(cve && typeof cve === 'object')).map(cve => ({ cve_id: typeof cve.cve_id === 'string' ? cve.cve_id : undefined, base_score: typeof cve.base_score === 'number' && Number.isFinite(cve.base_score) ? cve.base_score : undefined })) : undefined,
        labels: Array.isArray(product.labels) ? product.labels.filter(label => typeof label === 'string') : undefined,
      }));
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
    (!filters.protocol || String(record.protocol || '').toLocaleLowerCase() === filters.protocol.toLocaleLowerCase()) &&
    (!filters.content || serviceHasContent(record, filters.content)) &&
    (!filters.port?.trim() || Boolean(range && record.port !== undefined && record.port >= range.start && record.port <= range.end)));
  if (order === 'port-asc') matches.sort((a, b) => (a.record.port ?? Infinity) - (b.record.port ?? Infinity) || a.receivedIndex - b.receivedIndex);
  if (order === 'port-desc') matches.sort((a, b) => (b.record.port ?? -Infinity) - (a.record.port ?? -Infinity) || a.receivedIndex - b.receivedIndex);
  if (order === 'newest') matches.sort((a, b) => (b.record.uts ?? -Infinity) - (a.record.uts ?? -Infinity) || a.receivedIndex - b.receivedIndex);
  return matches;
}

export function servicePage(items: ServiceItem[], requestedPage: number, size = 25) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.max(1, Math.min(requestedPage, totalPages));
  const start = (page - 1) * size;
  return { page, totalPages, rows: items.slice(start, start + size), start: items.length ? start + 1 : 0, end: Math.min(start + size, items.length) };
}

export function hostLocation(host: HostDetail): string {
  const country = host.country_name || host.country_code;
  return [...new Set([host.city_name, host.region, country].filter(Boolean))].join(', ') || 'Not observed';
}

export function mappedDomains(map: DomainMapData | undefined): string[] {
  const values = Array.isArray(map) ? map : map ? [map] : [];
  return [...new Set(values.map(item => item.d).filter((value): value is string => typeof value === 'string' && !!value))];
}

export function safeBackPath(value: string | null, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return fallback;
  try { const url = new URL(value, 'https://local.invalid'); return url.origin === 'https://local.invalid' && ['/search', '/private/search'].includes(url.pathname) ? `${url.pathname}${url.search}` : fallback; } catch { return fallback; }
}
