import { ApiError } from '../api';
import type { BucketFilter, FacetData, SearchFilter, SearchRequest } from '../api';
import type { DemoBucket, DemoHost } from './fixtures';

export const DEMO_FIELDS = ['host', 'ip', 'type', 'port', 'protocol', 'transport', 'country_name', 'country_code', 'city_name', 'org', 'asn', 'os', 'status_code', 'title', 'products', 'vendors', 'cve_id', 'base_score', 'labels', 'redirects', 'domain', 'tls_info.server_name', 'cts', 'uts', 'port_count'];
export const DEMO_FACETS = ['type', 'port', 'status_code', 'org', 'country_name', 'protocol', 'products', 'title', 'cve_id', 'vendors', 'labels', 'redirects'];

export function fieldValues(host: DemoHost, field: string): Array<string | number> {
  const detail = host.detail;
  const ports = detail.ports ?? [];
  if (field === 'host' || field === 'domain') return [host.host];
  if (field === 'port_count') return [ports.length];
  if (['ip', 'type', 'country_name', 'country_code', 'city_name', 'org', 'asn', 'os', 'cts', 'uts'].includes(field)) {
    const value = (detail as Record<string, unknown>)[field];
    return typeof value === 'string' || typeof value === 'number' ? [value] : [];
  }
  if (field === 'products' || field === 'vendors') return ports.flatMap((port) => (port.detected_products ?? []).flatMap((product) => {
    const value = field === 'products' ? product.product : product.vendor;
    return value === undefined ? [] : [value];
  }));
  if (field === 'cve_id' || field === 'base_score') return ports.flatMap((port) => (port.detected_products ?? []).flatMap((product) => (product.cve_list ?? []).flatMap((cve) => {
    const value = field === 'cve_id' ? cve.cve_id : cve.base_score;
    return value === undefined ? [] : [value];
  })));
  if (field === 'labels') return ports.flatMap((port) => (port.detected_products ?? []).flatMap((product) => product.labels ?? []));
  if (field === 'redirects') return ports.flatMap((port) => port.redirects ?? []);
  if (field === 'tls_info.server_name') return ports.flatMap((port) => typeof port.tls_info?.server_name === 'string' ? [port.tls_info.server_name] : []);
  if (['port', 'protocol', 'transport', 'status_code', 'title'].includes(field)) return ports.flatMap((port) => {
    const value = (port as Record<string, unknown>)[field];
    return typeof value === 'string' || typeof value === 'number' ? [value] : [];
  });
  throw new ApiError('server', `The demo fixtures do not implement search field "${field}". The live backend remains authoritative.`, { outcome: 'rejected' });
}

function filterMatches(host: DemoHost, filter: SearchFilter): boolean {
  if (filter.operator) {
    if (!filter.filters?.length) throw new ApiError('server', '(402 Payment Required) empty search filter');
    const results = filter.filters.map((child) => filterMatches(host, child));
    if (filter.operator === 'AND') return results.every(Boolean);
    if (filter.operator === 'OR') return results.some(Boolean);
    if (filter.operator === 'NOT') return !results.some(Boolean);
    throw new ApiError('server', 'Invalid search operator');
  }
  if (!filter.field) throw new ApiError('server', 'search field cannot be empty');
  if (!filter.value) throw new ApiError('server', 'search value cannot be empty');
  const requested = filter.value.toLowerCase();
  return fieldValues(host, filter.field).some((value) => String(value).toLowerCase() === requested);
}

function ipv4Number(value: string): number | undefined {
  const parts = value.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part) || Number(part) > 255)) return undefined;
  return parts.reduce((sum, part) => sum * 256 + Number(part), 0);
}
function cidrMatch(ip: string, query: string): boolean | undefined {
  if (!query.includes('/')) return undefined;
  const [network, prefixText] = query.split('/');
  const number = ipv4Number(ip), base = ipv4Number(network), prefix = Number(prefixText);
  if (number === undefined || base === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return undefined;
  const size = 2 ** (32 - prefix);
  return Math.floor(number / size) === Math.floor(base / size);
}

/** A bounded fixture search, not a substitute for the backend search engine. */
export function matchingHosts(hosts: DemoHost[], query: SearchRequest, privateSearch = false, deletedResults: Set<string> = new Set()): DemoHost[] {
  const result = hosts.filter((host) => {
    if (privateSearch && (deletedResults.has(host.taskId) || (query.task_ids?.length && !query.task_ids.includes(host.taskId)))) return false;
    if (query.ip && query.ip !== host.card.ip) return false;
    if (query.host && !host.host.toLowerCase().includes(query.host.toLowerCase())) return false;
    if (query.cve_ID && !fieldValues(host, 'cve_id').includes(query.cve_ID)) return false;
    if (query.full_text_search) {
      const cidr = cidrMatch(host.card.ip, query.full_text_search.trim());
      if (cidr === false) return false;
      if (cidr !== true) {
        const searchable = JSON.stringify({ host: host.host, detail: host.detail }).toLowerCase();
        if (!query.full_text_search.toLowerCase().split(/\s+/).filter(Boolean).every((word) => searchable.includes(word))) return false;
      }
    }
    if (query.simple_search_filters?.some((filter) => !filterMatches(host, filter))) return false;
    if (query.security_body && !host.detail.ports?.some((port) => port.security_txt?.body?.toLowerCase().includes(query.security_body!.toLowerCase()))) return false;
    if (query.robots_body && !host.detail.ports?.some((port) => port.robots_txt?.body?.toLowerCase().includes(query.robots_body!.toLowerCase()))) return false;
    if (query.exposed_data && !JSON.stringify(host.detail.ports?.flatMap((port) => port.detected_products ?? [])).toLowerCase().includes(query.exposed_data.toLowerCase())) return false;
    if (query.min_size_mb !== undefined || query.max_size_mb !== undefined) {
      const sizes = host.detail.ports?.map((port) => new TextEncoder().encode(port.body ?? '').length / 1_000_000) ?? [];
      if (!sizes.some((size) => (query.min_size_mb === undefined || size >= query.min_size_mb) && (query.max_size_mb === undefined || size <= query.max_size_mb))) return false;
    }
    return (query.range_filter ?? []).every((range) => fieldValues(host, range.field).some((value) => {
      const numeric = Number(value), start = range.start === undefined ? undefined : Number(range.start), end = range.end === undefined ? undefined : Number(range.end);
      return Number.isFinite(numeric) && (start === undefined || numeric >= start) && (end === undefined || numeric <= end);
    }));
  });
  if (query.sort_field) {
    const direction = query.sort_direction === 'asc' ? 1 : -1;
    result.sort((a, b) => {
      const left = fieldValues(a, query.sort_field!)[0], right = fieldValues(b, query.sort_field!)[0];
      return direction * (typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? '')));
    });
  }
  return result;
}

export function facetData(hosts: DemoHost[], key: string): FacetData {
  const counts = new Map<string | number, number>();
  for (const host of hosts) {
    const values = fieldValues(host, key);
    const counted = ['type', 'org', 'country_name'].includes(key) ? [...new Set(values)] : values;
    for (let value of counted) {
      if (key === 'port' || key === 'status_code') value = String(value);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return { facet_name: key, facet_values: [...counts].map(([key, doc_count]) => ({ key, doc_count })).sort((a, b) => b.doc_count - a.doc_count) };
}

export function matchingBuckets(files: DemoBucket[], query: BucketFilter): DemoBucket[] {
  if (query.sort_field && !['cts', 'uts', 'size_mb'].includes(query.sort_field)) throw new ApiError('server', 'sort_field must be cts, uts, or size_mb');
  if (query.sort_direction && !['asc', 'desc'].includes(query.sort_direction)) throw new ApiError('server', 'write correct sort paramet(asc/desc)');
  const result = files.filter((file) => {
    const target = `${file.host}${file.container ? '/' + file.container : ''}`;
    if (query.host && !target.toLowerCase().includes(query.host.toLowerCase())) return false;
    if (query.key_words?.some((word) => !file.key?.toLowerCase().includes(word.toLowerCase()))) return false;
    if (query.stop_words?.some((word) => file.key?.toLowerCase().includes(word.toLowerCase()))) return false;
    if (query.extensions?.length) {
      const matches = query.extensions.map((extension) => extension.replace(/^\./, '').toLowerCase()).includes(file.extension?.toLowerCase() ?? '');
      if (query.exclude_extensions ? matches : !matches) return false;
    }
    if (query.product_names?.length && !query.product_names.includes(file.product_name)) return false;
    if (query.alphabets?.some((alphabet) => !file.alphabets?.includes(alphabet))) return false;
    if (query.min_size_mb !== undefined && (file.size_mb ?? 0) < query.min_size_mb) return false;
    if (query.max_size_mb !== undefined && (file.size_mb ?? 0) > query.max_size_mb) return false;
    if (query.gte_cts && (file.cts ?? 0) < query.gte_cts) return false;
    if (query.lte_cts && (file.cts ?? 0) > query.lte_cts) return false;
    if (query.gte_uts && (file.uts ?? 0) < query.gte_uts) return false;
    if (query.lte_uts && (file.uts ?? 0) > query.lte_uts) return false;
    return true; // The documented country/excluded-bucket fields are deliberately not applied.
  });
  if (query.sort_field) result.sort((a, b) => ((a[query.sort_field!] ?? 0) - (b[query.sort_field!] ?? 0)) * (query.sort_direction === 'asc' ? 1 : -1));
  return result;
}
