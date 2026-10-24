import type { HostCard, RangeFilter, ResponseMetadata, SearchFilter, SearchRequest } from '../../api';

export type Dataset = 'public' | 'private';
export const DEFAULT_PAGE_SIZE = 20;
export const FACET_NAMES = ['type', 'country_name', 'org', 'port', 'protocol', 'status_code', 'products', 'title', 'cve_id', 'vendors', 'labels', 'redirects'] as const;
export const FIELD_NAMES = ['host', 'ip', 'type', 'port', 'protocol', 'transport', 'country_name', 'country_code', 'city_name', 'org', 'asn', 'os', 'status_code', 'title', 'products', 'vendors', 'cve_id', 'labels', 'redirects', 'domain', 'tls_info.server_name'];
export const PAGE_CAPS: Record<string, number> = { Guest: 2, Free: 2, Plus: 25, Expert: 150, Business: 300 };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateFilter(value: unknown, depth = 0): SearchFilter {
  if (!record(value) || depth > 20) throw new Error('A condition must be a valid field/value or AND, OR, NOT group.');
  if (value.operator && !['AND', 'OR', 'NOT'].includes(String(value.operator))) throw new Error('Use AND, OR or NOT for a condition group.');
  if (value.operator) {
    if (!Array.isArray(value.filters) || value.filters.length === 0) throw new Error('Add a condition to every group.');
    return { operator: value.operator as SearchFilter['operator'], filters: value.filters.map(item => validateFilter(item, depth + 1)) };
  }
  if (typeof value.field !== 'string' || !value.field.trim()) throw new Error('Choose a field for every condition.');
  if (typeof value.value !== 'string' || !value.value.trim()) throw new Error(`Enter a value for ${value.field}.`);
  return { field: value.field.trim(), value: value.value };
}

/** Validates documented fields without fabricating missing response or request values. */
export function validateSearchRequest(value: unknown): SearchRequest {
  if (!record(value)) throw new Error('The search must be a JSON object.');
  const result: SearchRequest = {};
  const strings = ['ip', 'host', 'cve_ID', 'full_text_search', 'security_body', 'robots_body', 'exposed_data', 'sort_field', 'sort_direction', 'st', 'share_token'] as const;
  const numbers = ['page', 'docs_per_page', 'min_size_mb', 'max_size_mb'] as const;
  const supported = new Set<string>([...strings, ...numbers, 'task_ids', 'simple_search_filters', 'range_filter']);
  for (const key of Object.keys(value)) if (!supported.has(key)) throw new Error(`Unsupported search property: ${key}.`);
  for (const key of strings) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string') throw new Error(`${key} must be text.`);
      result[key] = value[key];
    }
  }
  for (const key of numbers) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) throw new Error(`${key} must be a number.`);
      result[key] = value[key];
    }
  }
  if (result.page !== undefined && (!Number.isInteger(result.page) || result.page < 1)) throw new Error('Page must be a positive whole number.');
  if (result.docs_per_page !== undefined && (!Number.isInteger(result.docs_per_page) || result.docs_per_page < 1 || result.docs_per_page > 50)) throw new Error('Choose between 1 and 50 rows per page.');
  if ((result.min_size_mb ?? 0) < 0 || (result.max_size_mb ?? 0) < 0) throw new Error('File sizes cannot be negative.');
  if (result.min_size_mb !== undefined && result.max_size_mb !== undefined && result.min_size_mb > result.max_size_mb) throw new Error('Minimum size must not exceed maximum size.');
  if (value.task_ids !== undefined) {
    if (!Array.isArray(value.task_ids) || value.task_ids.some(id => typeof id !== 'string' || !id.trim())) throw new Error('Task IDs must be a list of non-empty strings.');
    result.task_ids = [...value.task_ids] as string[];
  }
  if (value.simple_search_filters !== undefined) {
    if (!Array.isArray(value.simple_search_filters)) throw new Error('Conditions must be an array.');
    result.simple_search_filters = value.simple_search_filters.map(item => validateFilter(item));
  }
  if (value.range_filter !== undefined) {
    if (!Array.isArray(value.range_filter)) throw new Error('Ranges must be an array.');
    result.range_filter = value.range_filter.map(item => {
      if (!record(item) || typeof item.field !== 'string' || !item.field.trim()) throw new Error('Choose a field for each range.');
      const range: RangeFilter = { field: item.field.trim() };
      for (const key of ['start', 'end'] as const) {
        if (item[key] !== undefined && item[key] !== '') {
          if ((typeof item[key] !== 'string' && typeof item[key] !== 'number') || (typeof item[key] === 'number' && !Number.isFinite(item[key]))) throw new Error('Range values must be finite numbers or text.');
          range[key] = item[key];
        }
      }
      if (range.start === undefined && range.end === undefined) throw new Error('Enter at least one boundary for each range.');
      if (range.start !== undefined && range.end !== undefined && Number.isFinite(Number(range.start)) && Number.isFinite(Number(range.end)) && Number(range.start) > Number(range.end)) throw new Error(`The start of ${range.field} must not exceed the end.`);
      return range;
    });
  }
  return result;
}

export function decodeSearch(params: URLSearchParams): { request: SearchRequest; hasSearch: boolean; error?: string } {
  const hasSearch = params.has('request') || params.has('q') || params.get('run') === '1' || params.has('task_ids');
  try {
    let request: SearchRequest;
    if (params.has('request')) request = validateSearchRequest(JSON.parse(params.get('request')!));
    else {
      request = { page: Number(params.get('page') || 1), docs_per_page: Number(params.get('rows') || DEFAULT_PAGE_SIZE), sort_field: 'uts', sort_direction: 'desc' };
      if (params.has('q')) request.full_text_search = params.get('q')!;
      if (params.has('task_ids')) request.task_ids = params.get('task_ids')!.split(',').filter(Boolean);
      request = validateSearchRequest(request);
    }
    if (params.has('st')) request.st = params.get('st')!;
    return { request, hasSearch };
  } catch (error) {
    return { request: {}, hasSearch, error: error instanceof Error ? error.message : 'This search link is invalid.' };
  }
}

export function encodeSearch(request: SearchRequest): string {
  const { st, share_token, ...body } = validateSearchRequest(request);
  const params = new URLSearchParams({ request: JSON.stringify(body), run: '1' });
  if (body.full_text_search) params.set('q', body.full_text_search);
  if (st || share_token) params.set('st', st || share_token!);
  return params.toString();
}

export function searchPath(dataset: Dataset): string { return dataset === 'private' ? '/private/search' : '/search'; }
export function withoutShareToken(request: SearchRequest): SearchRequest { const { st: _st, share_token: _shareToken, ...body } = request; return body; }
export function isShared(request: SearchRequest): boolean { return Boolean(request.st || request.share_token); }


/** Analytics describes the matching set; presentation changes do not need another paid request.
 * Shared tokens are bound to the exact body, so their payload must remain untouched. */
export function analyticsRequest(request: SearchRequest): SearchRequest {
  if (isShared(request)) return request;
  const { page: _page, docs_per_page: _rows, sort_field: _sort, sort_direction: _direction, ...conditions } = request;
  return conditions;
}

function isFacetCondition(filter: SearchFilter, field: string): boolean {
  return !filter.operator ? filter.field === field : filter.operator === 'OR' && Boolean(filter.filters?.length) && filter.filters!.every(child => !child.operator && child.field === field);
}

/** Only direct facet rules are managed here; mixed or negated advanced groups stay intact. */
export function activeFacetValues(request: SearchRequest, field: string): string[] {
  return [...new Set((request.simple_search_filters || []).filter(filter => isFacetCondition(filter, field)).flatMap(filter => filter.operator ? filter.filters!.map(child => child.value!) : [filter.value!]))];
}

export function toggleFacet(request: SearchRequest, field: string, value: string): SearchRequest {
  const current = activeFacetValues(request, field);
  const values = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
  const filters = (request.simple_search_filters || []).filter(filter => !isFacetCondition(filter, field));
  if (values.length === 1) filters.push({ field, value: values[0] });
  else if (values.length > 1) filters.push({ operator: 'OR', filters: values.map(item => ({ field, value: item })) });
  return { ...request, simple_search_filters: filters, page: 1 };
}

function stripField(nodes: SearchFilter[], field: string): SearchFilter[] {
  return nodes.flatMap(node => {
    if (!node.operator) return node.field === field ? [] : [node];
    const filters = stripField(node.filters || [], field);
    return filters.length ? [{ ...node, filters }] : [];
  });
}

export function withType(request: SearchRequest, type: string): SearchRequest {
  // A single selector cannot express alternatives or exclusions. Leave those
  // rules intact so changing this shortcut cannot silently broaden a search.
  if (selectedType(request) === 'custom') return request;
  const filters = stripField(request.simple_search_filters || [], 'type');
  if (type) filters.push({ field: 'type', value: type });
  return { ...request, simple_search_filters: filters, page: 1 };
}

export function selectedType(request: SearchRequest): string {
  const matches: string[] = [];
  let complex = false;
  const visit = (nodes: SearchFilter[], conditional = false) => nodes.forEach(node => { if (node.field === 'type' && node.value) { matches.push(node.value); if (conditional) complex = true; } if (node.filters) visit(node.filters, conditional || node.operator === 'OR' || node.operator === 'NOT'); });
  visit(request.simple_search_filters || []);
  return complex || matches.length > 1 ? 'custom' : matches[0] || '';
}

/** Keep valid rows usable when optional server fields are missing or malformed.
 * receivedCount stays separate because pagination is based on the server page. */
export function parseHostRows(value: unknown): { hosts: HostCard[]; receivedCount: number; omittedCount: number; incompleteCount: number } {
  if (!Array.isArray(value)) throw new Error('The server returned an unexpected host list. Your search has been kept.');
  const hosts: HostCard[] = [];
  let omittedCount = 0, incompleteCount = 0;
  for (const row of value) {
    if (!record(row) || typeof row.ip !== 'string' || !row.ip.trim()) { omittedCount++; continue; }
    const host: HostCard = { ip: row.ip.trim() };
    let incomplete = false;
    for (const key of ['os', 'org', 'city_name', 'country_code', 'region'] as const) {
      if (typeof row[key] === 'string') host[key] = row[key];
      else if (row[key] !== undefined && row[key] !== null) incomplete = true;
    }
    if (typeof row.uts === 'number' && Number.isFinite(row.uts)) host.uts = row.uts;
    else if (row.uts !== undefined && row.uts !== null) incomplete = true;
    if (Array.isArray(row.labels_list)) {
      host.labels_list = [...new Set(row.labels_list.filter((label): label is string => typeof label === 'string' && label.length > 0))];
      if (row.labels_list.some(label => typeof label !== 'string')) incomplete = true;
    } else if (row.labels_list !== undefined && row.labels_list !== null) incomplete = true;
    if (Array.isArray(row.open_ports)) {
      const ports: NonNullable<HostCard['open_ports']> = [];
      for (const port of row.open_ports) {
        if (!record(port) || typeof port.port !== 'number' || !Number.isInteger(port.port) || port.port < 0 || port.port > 65535) { incomplete = true; continue; }
        ports.push({ port: port.port, ...(typeof port.protocol === 'string' ? { protocol: port.protocol } : {}) });
        if (port.protocol !== undefined && port.protocol !== null && typeof port.protocol !== 'string') incomplete = true;
      }
      // An invalid list is unknown, not evidence that no ports were observed.
      if (ports.length || row.open_ports.length === 0) host.open_ports = ports;
    } else if (row.open_ports !== undefined && row.open_ports !== null) incomplete = true;
    if (incomplete) incompleteCount++;
    hosts.push(host);
  }
  return { hosts, receivedCount: value.length, omittedCount, incompleteCount };
}

/** Current response restrictions prevent sending a request known to be blocked. */
export function searchAccessIssues(request: SearchRequest, restrictions: ResponseMetadata['search_restrictions']): string[] {
  if (!restrictions || isShared(request)) return [];
  const fields = new Set(restrictions.blocked_fields || []), values = new Set(restrictions.blocked_values || []);
  const issues = new Set<string>();
  const field = (name: string) => { if (fields.has(name)) issues.add(`The field “${name}” is unavailable with your current access.`); };
  const value = (text: string) => { if (values.has(text)) issues.add(`The value “${text}” is unavailable with your current access.`); };
  const visit = (filters: SearchFilter[]) => filters.forEach(filter => { if (filter.field) field(filter.field); if (filter.value) value(filter.value); if (filter.filters) visit(filter.filters); });
  visit(request.simple_search_filters || []);
  request.range_filter?.forEach(range => field(range.field));
  for (const key of ['security_body', 'robots_body', 'exposed_data'] as const) if (request[key]) field(key);
  if (request.exposed_data) value(request.exposed_data);
  for (const key of ['min_size_mb', 'max_size_mb'] as const) if ((request[key] || 0) > 0) field(key);
  return [...issues];
}

export function filterSummary(filter: SearchFilter): string {
  if (filter.operator) return `${filter.operator} (${(filter.filters || []).map(filterSummary).join(', ')})`;
  return `${filter.field || 'Field'}: ${filter.value || 'value'}`;
}
export function queryLabel(request: SearchRequest): string {
  return request.full_text_search || request.host || (request.simple_search_filters || []).map(filterSummary).join(' · ') || 'All accessible hosts';
}
export function facetUnit(name: string): 'Hosts' | 'Records' { return ['type', 'org', 'country_name'].includes(name) ? 'Hosts' : 'Records'; }
export function facetTitle(name: string): string { return ({ country_name: 'Country', org: 'Organization', status_code: 'HTTP status', cve_id: 'CVE', port: 'Ports' } as Record<string, string>)[name] || name.charAt(0).toUpperCase() + name.slice(1).replaceAll('_', ' '); }
export function dateLabel(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Not provided';
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC';
}
export function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}

export function parseSavedQuery(query: string): SearchRequest { return validateSearchRequest(JSON.parse(query)); }
