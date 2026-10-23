import type { DomainMapData, HostDetail, PortRecord } from '../../api';

export interface ServiceItem { key: string; record: PortRecord; receivedIndex: number; context: string }
export type ServiceOrder = 'received' | 'port-asc' | 'port-desc' | 'newest';

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
  return typeof name === 'string' && name ? name : record.link || record.title || record.cert_domains?.[0] || 'Context not observed';
}

/** A UI identity for received records, not a fabricated server record ID. */
export function serviceItems(records: PortRecord[]): ServiceItem[] {
  const occurrences = new Map<string, number>();
  return records.map((record, receivedIndex) => {
    const identity = JSON.stringify([record.port ?? null, record.transport ?? null, record.protocol ?? null, serviceContext(record), record.uts ?? null]);
    const occurrence = occurrences.get(identity) || 0;
    occurrences.set(identity, occurrence + 1);
    return { key: `${identity}#${occurrence}`, record, receivedIndex, context: serviceContext(record) };
  });
}

export function filterServices(items: ServiceItem[], filter: string, order: ServiceOrder): ServiceItem[] {
  const query = filter.trim().toLocaleLowerCase();
  const matches = query ? items.filter(({ record, context }) => [record.port, record.transport, record.protocol, context, record.title, ...(record.detected_products || []).map(product => [product.product, product.vendor, product.version].filter(Boolean).join(' '))].some(value => value !== undefined && String(value).toLocaleLowerCase().includes(query))) : [...items];
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
