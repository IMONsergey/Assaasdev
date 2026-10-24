/** Reference transcribed from https://apcosys.net/docs/api, reviewed 2026-10-24.
 * Example response values are illustrative. Nothing in this module makes requests.
 */
export const API_BASE_URL = 'https://api.apcosys.net/api/v1';
export const API_DOCS_SOURCE = 'https://apcosys.net/docs/api';
export type ExampleLanguage = 'curl' | 'javascript' | 'python';
export type DocField = { name: string; type: string; description: string; defaultValue?: string; required?: boolean; access?: string };
export type SchemaGroup = { title: string; fields: DocField[]; note?: string };
export type ApiEndpoint = {
  id: string; title: string; method: 'GET' | 'POST'; path: string; summary: string;
  group: 'Hosts' | 'Buckets' | 'Private search'; access: string; cost: number;
  request: DocField[]; response: SchemaGroup[]; exampleBody?: Record<string, unknown>;
  exampleResponse: Record<string, unknown>; notes?: string[];
};
const field = (name: string, type: string, description: string, extra: Partial<DocField> = {}): DocField => ({ name, type, description, ...extra });

export const hostSearchFields: DocField[] = [
  field('page', 'integer', 'Result page, starting at 1.', { defaultValue: '1' }),
  field('docs_per_page', 'integer', 'Results per page. Maximum 100.', { defaultValue: '50' }),
  field('sort_field', 'string', 'Ignored. Host results always use uts, newest first.'),
  field('sort_direction', 'string', 'Ignored. Host results always use descending order.'),
  field('full_text_search', 'string', 'Search banner, body, domain and HTTP headers. IP/CIDR-like queries also search the IP field.'),
  field('simple_search_filters', 'Filter[]', 'Field conditions, including nested AND, OR and NOT groups. See Filters & syntax.'),
  field('exposed_data', 'string', 'Search exposed-data values.', { access: 'Expert, Business' }),
  field('security_body', 'string', 'Search the contents of security.txt.', { access: 'Business' }),
  field('min_size_mb', 'number', 'Minimum exposed-data size in MB.', { access: 'Expert, Business' }),
  field('max_size_mb', 'number', 'Maximum exposed-data size in MB.', { access: 'Expert, Business' }),
  field('range_filter', 'Range[]', 'Inclusive numeric/time ranges. Field access follows the subscription.'),
];
export const bucketSearchFields: DocField[] = [
  field('page', 'integer', 'Result page, starting at 1.', { defaultValue: '1' }),
  field('docs_per_page', 'integer', 'Number of items per page.', { defaultValue: '50' }),
  field('sort_field', 'string', 'One of cts, uts or size_mb.', { defaultValue: 'cts' }),
  field('sort_direction', 'string', 'Use asc or desc.', { defaultValue: 'desc' }),
  field('host', 'string', 'Match a bucket host.'),
  field('stop_words', 'string[]', 'Words to exclude from the search.'),
  field('min_size_mb', 'number', 'Minimum size in MB.', { access: 'Expert, Business' }),
  field('max_size_mb', 'number', 'Maximum size in MB.', { access: 'Expert, Business' }),
  field('key_words', 'string[]', 'Keywords to search for.'),
  field('extensions', 'string[]', 'File extensions to match.'),
  field('alphabets', 'string[]', 'Writing systems, such as latin or cyrillic.'),
  field('exclude_extensions', 'boolean', 'Exclude, instead of include, the selected extensions.'),
  field('gte_uts', 'integer', 'Earliest update time, inclusive. Unix seconds.'),
  field('lte_uts', 'integer', 'Latest update time, inclusive. Unix seconds.'),
  field('gte_cts', 'integer', 'Earliest creation time, inclusive. Unix seconds.'),
  field('lte_cts', 'integer', 'Latest creation time, inclusive. Unix seconds.'),
  field('country_code_include', 'string[]', 'Country codes to include.'),
  field('country_code_exclude', 'string[]', 'Country codes to exclude.'),
  field('excluded_buckets', 'string[]', 'Buckets to omit.'),
  field('product_names', 'string[]', 'Bucket product names to match.'),
];
export const filterShape: DocField[] = [
  field('field', 'string', 'Field name for a leaf condition.', { required: true }),
  field('value', 'string', 'Nonempty match value for a leaf condition.', { required: true }),
  field('operator', 'string', 'AND, OR or NOT.', { defaultValue: 'AND' }),
  field('filters', 'Filter[]', 'Nested conditions. Use with operator to create a group instead of a leaf.'),
];
export const rangeShape: DocField[] = [
  field('field', 'string', 'Field to compare, such as cts, uts, port_count or base_score.'),
  field('start', 'number', 'Inclusive lower bound (gte).'),
  field('end', 'number', 'Inclusive upper bound (lte).'),
];
export const filterGroups: SchemaGroup[] = [
  { title: 'Host & geography', fields: [
    field('ip', 'ip', 'IP address; for example 192.0.2.10.'),
    field('cidr', 'ip', 'Subnet; for example 192.0.2.0/24. Uses the IP field.'),
    field('domain', 'keyword', 'Domain name, such as example.com.'),
    field('as_cidr', 'keyword', 'Exact ASN network block.'),
    field('type', 'keyword', 'ipv4, ipv6 or domain. Omit to search all data types.'),
    field('asn', 'integer', 'Autonomous system number.'),
    field('org', 'keyword', 'ASN organization.'),
    field('country_code', 'keyword', 'Country code, such as US or GB.'),
    field('country_name', 'keyword', 'Country name.'),
    field('continent_name', 'keyword', 'Continent name.'),
    field('city_name', 'keyword', 'City name.'),
    field('region', 'keyword', 'Region name.'),
    field('region_code', 'keyword', 'Region code.'),
    field('os', 'keyword', 'Operating system.'),
    field('port_count', 'integer', 'Port count on the hosts index; supports ranges.', { access: 'Expert, Business' }),
  ] },
  { title: 'Ports & services', fields: [
    field('port', 'integer', 'Port number; comma-separated values such as 80,443 use OR.'),
    field('protocol', 'keyword', 'Protocol, such as http, https or ssh.'),
    field('transport', 'keyword', 'Transport, such as tcp.'),
    field('status_code', 'integer', 'HTTP status code.'),
    field('title', 'text', 'Service/page title.'),
    field('banner', 'text', 'Service banner.'),
    field('body', 'text', 'Response body text.'),
    field('banner_sha256', 'keyword', 'SHA-256 hash of banner bytes.'),
    field('body_sha256', 'keyword', 'SHA-256 hash of body bytes.'),
    field('favicon_md5', 'keyword', 'MD5 hash of favicon bytes.'),
    field('redirects', 'text', 'Redirect URL/path. redirect_paths is also accepted.'),
  ] },
  { title: 'Products & vulnerabilities', fields: [
    field('products', 'keyword[]', 'Detected product, such as nginx or apache.'),
    field('vendors', 'keyword[]', 'Product vendor.'),
    field('cve_id', 'keyword', 'CVE identifier.', { access: 'Plus, Expert, Business' }),
    field('base_score', 'number', 'Vulnerability score; supports range_filter.', { access: 'Plus, Expert, Business' }),
    field('labels', 'keyword[]', 'Classification labels; value restrictions still apply.'),
    field('exposed_data', 'text', 'Exposed-data values.', { access: 'Expert, Business' }),
  ] },
  { title: 'Headers & TLS', fields: [
    field('headers.k', 'nested keyword', 'Exact header name, such as Server.'),
    field('headers.v', 'nested text', 'Text within header values.'),
    field('headers.{Name}', 'nested', 'Header-specific value, such as headers.Server = nginx. header.{Name} is also accepted.'),
    field('tls_info.server_name', 'keyword', 'TLS server name (SNI).'),
    field('tls_info.tls_version', 'keyword', 'TLS version.'),
    field('tls_info.cipher_suite', 'keyword', 'Cipher suite.'),
    field('tls_info.ja4s', 'keyword', 'JA4S fingerprint.'),
    field('tls_info.serial_number', 'keyword', 'Certificate serial number.'),
    field('tls_info.issuer', 'text', 'Certificate issuer.'),
    field('tls_info.subject', 'text', 'Certificate subject.'),
    field('tls_info.sha256', 'keyword', 'SHA-256 hash of certificate DER bytes.'),
  ] },
  { title: 'security.txt & time', fields: [
    field('security_body', 'text', 'Words in security.txt; also supported at the top level of the request.', { access: 'Business' }),
    field('cts', 'date / integer', 'Creation time in Unix seconds, usually via range_filter.', { access: 'Expert, Business' }),
    field('uts', 'date / integer', 'Update time in Unix seconds; supports conditions and ranges.', { access: 'Expert, Business' }),
  ] },
];

const hostListResponse: SchemaGroup[] = [
  { title: 'Response', fields: [field('total', 'integer', 'Total matching hosts.'), field('page', 'integer', 'Current page.'), field('docs_per_page', 'integer', 'Page size.'), field('hosts', 'HostSummary[]', 'Hosts on this page.')] },
  { title: 'hosts[] · HostSummary', fields: [
    field('ip', 'string', 'IP or domain identifier.'), field('os', 'string', 'Operating system, when present.'), field('org', 'string', 'ASN organization.'), field('city_name', 'string', 'City.'), field('country_code', 'string', 'Country code.'), field('region', 'string', 'Region.'), field('uts', 'integer', 'Last update in Unix seconds.'), field('labels_list', 'string[]', 'Labels.'), field('open_ports', '{ protocol, port }[]', 'Protocol and port number for each open port.'),
  ] },
];
export const hostDetailResponse: SchemaGroup[] = [
  { title: 'Host', fields: [
    field('ip', 'string', 'IP or host identifier.'), field('type', 'string', 'ipv4, ipv6 or domain.'), field('as_cidr', 'string', 'ASN network block, when present.'), field('os', 'string', 'Operating system.'), field('country_code', 'string', 'Country code.'), field('country_name', 'string', 'Country.'), field('continent_name', 'string', 'Continent.'), field('city_name', 'string', 'City.'), field('region', 'string', 'Region.'), field('region_code', 'string', 'Region code.'), field('asn', 'integer', 'Autonomous system number.'), field('org', 'string', 'ASN organization.'), field('cts', 'integer', 'Creation time in Unix seconds.'), field('uts', 'integer', 'Update time in Unix seconds.'), field('ports', 'PortResult[]', 'Observed services and ports.'),
  ] },
  { title: 'ports[] · PortResult', fields: [
    field('port', 'integer', 'Port number.'), field('protocol', 'string', 'Service protocol.'), field('banner', 'string', 'Service banner.'), field('transport', 'string', 'Transport protocol.'), field('uts', 'integer', 'Update time in Unix seconds.'), field('status', 'string', 'Port state, such as closed_port.'), field('tls_info', 'object', 'Flat certificate and handshake fields; see below.'), field('detected_products', 'Product[]', 'Detected software and vulnerability information.'), field('banner_sha256', 'string', 'SHA-256 of banner bytes, in hexadecimal.'), field('favicon_md5', 'string', 'MD5 of favicon bytes, in hexadecimal.'), field('body', 'string', 'Response body.'), field('body_sha256', 'string', 'SHA-256 of body bytes, in hexadecimal.'), field('title', 'string', 'Page/service title.'), field('status_code', 'integer', 'HTTP response status.'), field('headers', 'Record<string, string[]>', 'Header name → array of values.'), field('cert_domains', 'string[]', 'Certificate domain names.'), field('redirects', 'string[]', 'Redirect chain; the first item may be the original URL.'), field('link', 'string', 'Final URL, or scheme://host:port without redirects.'), field('security_txt', 'object', 'security.txt information, when found.'), field('header_domains', 'string[]', 'Domain names found in headers.'), field('error', 'string', 'Observation error, if any.'),
  ] },
  { title: 'ports[].tls_info', note: 'Certificate fields live directly on tls_info. There is no certificate_info wrapper.', fields: [
    field('tls_version', 'string', 'TLS version.'), field('cipher_suite', 'string', 'Cipher suite.'), field('server_name', 'string', 'SNI.'), field('sha256', 'string', 'SHA-256 of certificate DER bytes, in hexadecimal.'), field('ja4s', 'string', 'JA4S fingerprint.'), field('serial_number', 'string', 'Certificate serial number.'), field('issuer', 'string', 'Certificate issuer.'), field('subject', 'string', 'Certificate subject.'), field('not_before', 'string', 'Start of validity.'), field('not_after', 'string', 'End of validity.'), field('dns_names', 'string[]', 'Certificate DNS names.'), field('email_addresses', 'string[]', 'Certificate email addresses.'), field('ip_addresses', 'string[]', 'Certificate IP addresses.'), field('uris', 'string[]', 'Certificate URIs.'), field('public_key_algorithm', 'string', 'Public-key algorithm.'), field('signature_algorithm', 'string', 'Signature algorithm.'), field('key_usage', 'string', 'Key usage.'), field('ext_key_usage', 'array', 'Extended key usages.'), field('is_ca', 'boolean', 'Whether this is a CA certificate.'), field('ocsp_server', 'string[]', 'OCSP servers.'), field('crl_distribution_points', 'string[]', 'Revocation-list locations.'),
  ] },
  { title: 'ports[].detected_products[]', fields: [
    field('product', 'string', 'Product name.'), field('vendor', 'string', 'Vendor.'), field('version', 'string', 'Detected version.'), field('labels', 'string[]', 'Classification labels.'), field('cve_product', 'string', 'CVE product name.'), field('cve_vendor', 'string', 'CVE vendor name.'), field('cve_identifier', 'string', 'CVE identifier.'), field('cve_list', '{ cve_id, base_score }[]', 'CVE IDs (string) and scores (number).'), field('exposed_data', '{ field_headers, field_value }', 'field_headers is string[]; field_value is string[][]. Hidden on lower plans.', { access: 'Expert, Business' }),
  ] },
  { title: 'ports[].security_txt', fields: [
    field('is_security_txt', 'boolean', 'Whether security.txt was found.'), field('body', 'string', 'Complete file text.'), field('contacts', 'string[]', 'Contact URLs/emails.'), field('url', 'string', 'Full security.txt URL.'), field('endpoint', 'string', 'File path, such as /.well-known/security.txt.'),
  ] },
];
const facetResponse: SchemaGroup[] = [
  { title: 'Response', fields: [field('facets', 'Facet[]', 'Aggregation groups.')] },
  { title: 'facets[] · Facet', fields: [field('facet_name', 'string', 'type, port, status_code, org, country_name, protocol, products, title, cve_id, vendors, labels or redirects.'), field('facet_values', '{ key, doc_count }[]', 'key is a string or number; doc_count is the document or unique-host count.')] },
];
const bucketResponse: SchemaGroup[] = [
  { title: 'Response', fields: [field('result_count', 'integer', 'Number of items returned.'), field('result', 'BucketInfo[]', 'Matching bucket records.')] },
  { title: 'result[] · BucketInfo', fields: [
    field('host', 'string', 'Bucket host.'), field('protocol', 'string', 'http or https.'), field('key', 'string', 'Bucket key/name.'), field('container', 'string', 'Container, when present.'), field('alphabets', 'string[]', 'Writing systems.'), field('alias_hosts', 'string[]', 'Alternate hosts, when present.'), field('cts', 'integer', 'Creation time in Unix seconds.'), field('uts', 'integer', 'Update time in Unix seconds.'), field('size_mb', 'number', 'Size in MB.'), field('extension', 'string', 'File extension.'),
  ] },
];
const hostExampleBody = { page: 1, docs_per_page: 10, simple_search_filters: [{ field: 'port', value: '443' }, { field: 'products', value: 'nginx' }] };
const hostExampleResponse = { total: 1, page: 1, docs_per_page: 10, hosts: [{ ip: '192.0.2.10', org: 'Example organization', country_code: 'US', city_name: 'New York', uts: 1748026971, labels_list: ['web'], open_ports: [{ protocol: 'https', port: 443 }] }] };
const detailExampleResponse = { ip: '192.0.2.10', type: 'ipv4', org: 'Example organization', country_code: 'US', uts: 1748026971, ports: [{ port: 443, protocol: 'https', transport: 'tcp', title: 'Example service', status_code: 200, headers: { Server: ['nginx'] }, detected_products: [{ product: 'nginx', vendor: 'nginx', version: '', labels: ['web'], cve_list: [] }] }] };
const facetExampleResponse = { facets: [{ facet_name: 'port', facet_values: [{ key: '443', doc_count: 24 }, { key: '80', doc_count: 12 }] }] };
const taskField = field('task_ids', 'string[]', 'Optional private-scan task IDs. Omit to search your private scan data.');
const analyticsFields = hostSearchFields.filter(item => !['page', 'docs_per_page', 'sort_field', 'sort_direction'].includes(item.name));
const privateNotes = ['Uses your private scan data automatically. A type filter is not needed to select the private dataset.', 'Request and response formats match the corresponding public endpoint. Business access is required.'];

export const API_ENDPOINTS: ApiEndpoint[] = [
  { id: 'search-hosts', title: 'Search hosts', method: 'POST', path: '/search/hosts', summary: 'Find hosts by location, port, product and other observed fields.', group: 'Hosts', access: 'Plus and above', cost: 1, request: hostSearchFields, response: hostListResponse, exampleBody: hostExampleBody, exampleResponse: hostExampleResponse, notes: ['Every request-body field is optional.', 'Without a type condition, the search includes IPv4, IPv6 and domains. Port, HTTP, TLS and product conditions automatically use the ports index.', 'Host results are always sorted by uts descending. Custom sort fields are ignored.'] },
  { id: 'get-host', title: 'Get a host', method: 'GET', path: '/search/hosts/:ip', summary: 'Read the observed ports, HTTP responses, TLS information and products for one IP address or domain.', group: 'Hosts', access: 'Plus and above', cost: 1, request: [field('ip', 'string', 'IP address or domain name in the URL path.', { required: true })], response: hostDetailResponse, exampleResponse: detailExampleResponse, notes: ['A malformed IP/host returns 400. A host that is not indexed returns 404.', 'ports[].detected_products[].exposed_data is included only on Expert and Business.'] },
  { id: 'host-analytics', title: 'Host analytics', method: 'POST', path: '/search/analytics', summary: 'Aggregate the same host search into facets such as ports, countries and products.', group: 'Hosts', access: 'Plus and above', cost: 3, request: analyticsFields, response: facetResponse, exampleBody: { simple_search_filters: [{ field: 'country_code', value: 'US' }] }, exampleResponse: facetExampleResponse, notes: ['Uses the same search conditions and data-type scope as host search.', 'Counts can represent documents or unique hosts, depending on the facet.'] },
  { id: 'search-buckets', title: 'Search buckets', method: 'POST', path: '/search/buckets', summary: 'Find bucket records using names, file extensions, size and geography.', group: 'Buckets', access: 'Plus and above', cost: 1, request: bucketSearchFields, response: bucketResponse, exampleBody: { page: 1, docs_per_page: 20, sort_field: 'cts', sort_direction: 'desc', extensions: ['pdf'] }, exampleResponse: { result_count: 1, result: [{ host: 'files.example.com', protocol: 'https', key: 'documents/guide.pdf', alphabets: ['latin'], cts: 1748026971, uts: 1748026971, size_mb: 2.4, extension: 'pdf' }] }, notes: ['result_count describes items in this response. It is not documented as a total matching-record count.', 'Host-search and bucket-search request shapes differ; use the bucket fields listed here.'] },
  { id: 'bucket-analytics', title: 'Bucket analytics', method: 'POST', path: '/search/buckets/analytics', summary: 'Group matching bucket files by host.', group: 'Buckets', access: 'Plus and above', cost: 1, request: bucketSearchFields, response: [{ title: 'Response', fields: [field('result_count', 'integer', 'Number of items.'), field('result', '{ host, file_count }[]', 'host is a string; file_count is an integer.')] }], exampleBody: { extensions: ['pdf'], country_code_include: ['US'] }, exampleResponse: { result_count: 1, result: [{ host: 'files.example.com', file_count: 24 }] }, notes: ['Accepts the same request body as bucket search.'] },
  { id: 'private-hosts', title: 'Search private hosts', method: 'POST', path: '/search/private/hosts', summary: 'Search only the hosts from your private scans, optionally scoped to specific tasks.', group: 'Private search', access: 'Business', cost: 1, request: [...hostSearchFields, taskField], response: hostListResponse, exampleBody: { page: 1, docs_per_page: 10, simple_search_filters: [{ field: 'port', value: '443' }], task_ids: ['YOUR_TASK_ID'] }, exampleResponse: hostExampleResponse, notes: privateNotes },
  { id: 'get-private-host', title: 'Get a private host', method: 'GET', path: '/search/private/hosts/:ip', summary: 'Read details for one IP address in your private scan data.', group: 'Private search', access: 'Business', cost: 1, request: [field('ip', 'string', 'IP address in the URL path.', { required: true })], response: hostDetailResponse, exampleResponse: detailExampleResponse, notes: privateNotes },
  { id: 'private-analytics', title: 'Private analytics', method: 'POST', path: '/search/private/analytics', summary: 'Build host facets from your private scans.', group: 'Private search', access: 'Business', cost: 3, request: [...analyticsFields, taskField], response: facetResponse, exampleBody: { simple_search_filters: [{ field: 'port', value: '443' }], task_ids: ['YOUR_TASK_ID'] }, exampleResponse: facetExampleResponse, notes: privateNotes },
];

export const API_PLANS = [
  { name: 'Free', pages: 2, rps: 0, api: false, private: false },
  { name: 'Plus', pages: 25, rps: 1, api: true, private: false },
  { name: 'Expert', pages: 150, rps: 2, api: true, private: false },
  { name: 'Business', pages: 300, rps: 5, api: true, private: true },
] as const;
export const API_ERRORS = [
  { code: 400, title: 'Bad request', description: 'Invalid JSON body, parameters or IP/host.', action: 'Check the request shape, types and path value.' },
  { code: 401, title: 'Unauthorized', description: 'The API key is missing or invalid.', action: 'Check X-API-Key and whether the key was rotated.' },
  { code: 402, title: 'Plan restriction', description: 'A search field or value is unavailable on this subscription.', action: 'Remove the restricted condition or choose a plan that includes it.' },
  { code: 404, title: 'Host not found', description: 'The host lookup has no matching record.', action: 'Check the host and whether you are using public or private data.' },
  { code: 429, title: 'Rate limit reached', description: 'The request rate exceeds the account allowance.', action: 'Reduce concurrency and space out requests before retrying.' },
  { code: 500, title: 'Search or server error', description: 'The search failed. An unsupported search field can also produce this error.', action: 'Read the error string and validate field names before retrying.' },
] as const;
export const RESTRICTED_FIELDS = [
  { fields: 'cve_id, base_score', access: 'Plus, Expert, Business' },
  { fields: 'exposed_data, min_size_mb, max_size_mb, cts, uts, port_count', access: 'Expert, Business' },
  { fields: 'security_body', access: 'Business' },
] as const;
export const RESTRICTED_VALUES = [
  { fields: 'vulnerability, bucket', access: 'Plus, Expert, Business' },
  { fields: 'leak', access: 'Expert, Business' },
  { fields: 'security_txt', access: 'Business' },
] as const;

export type DocTopic = { id: string; title: string; group: string; summary: string; keywords: string; endpoint?: ApiEndpoint };
export const DOC_TOPICS: DocTopic[] = [
  { id: 'getting-started', title: 'Getting started', group: 'Start here', summary: 'Your first request, API base URL and response format.', keywords: `${API_BASE_URL} quickstart curl javascript python pagination page docs_per_page` },
  { id: 'authentication', title: 'Authentication', group: 'Start here', summary: 'Connect with an account API key.', keywords: 'X-API-Key header credentials authorization 401 rotate secret env APCOSYS_API_KEY' },
  ...API_ENDPOINTS.map(endpoint => ({ id: endpoint.id, title: endpoint.title, group: endpoint.group, summary: endpoint.summary, keywords: [endpoint.method, endpoint.path, `/api/v1${endpoint.path}`, endpoint.access, ...endpoint.request.map(item => `${item.name} ${item.description}`), ...endpoint.response.flatMap(group => group.fields.map(item => `${group.title} ${item.name} ${item.description}`))].join(' '), endpoint })),
  { id: 'filters', title: 'Filters & syntax', group: 'Reference', summary: 'Search fields, nested conditions, ranges and header filters.', keywords: `${JSON.stringify(filterGroups)} simple_search_filters range_filter AND OR NOT wildcard phrase full_text_search` },
  { id: 'limits', title: 'Plans & limits', group: 'Reference', summary: 'Rate limits, method costs and access restrictions.', keywords: `${JSON.stringify(API_PLANS)} ${JSON.stringify(RESTRICTED_FIELDS)} ${JSON.stringify(RESTRICTED_VALUES)} RPS requests second credits billing pagination page docs_per_page 402 429` },
  { id: 'errors', title: 'Errors', group: 'Reference', summary: 'Status codes and how to handle a failed request.', keywords: JSON.stringify(API_ERRORS) },
];

/** A bounded text search over public documentation, never over account credentials. */
export function searchDocTopics(query: string): DocTopic[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 16);
  if (!words.length) return DOC_TOPICS;
  return DOC_TOPICS.map(topic => {
    const title = topic.title.toLowerCase(), text = `${topic.title} ${topic.summary} ${topic.keywords}`.toLowerCase();
    return { topic, score: words.every(word => text.includes(word)) ? words.reduce((sum, word) => sum + (title.includes(word) ? 5 : 1), 0) : 0 };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).map(item => item.topic);
}

/** Invalid or malformed hash values fall back without throwing during navigation. */
export function resolveDocTopic(hash: string): DocTopic {
  let candidate = hash.replace(/^#/, '');
  try { candidate = decodeURIComponent(candidate); } catch { candidate = ''; }
  return DOC_TOPICS.find(topic => topic.id === candidate) ?? DOC_TOPICS[0];
}

export type DocSelection = { view: 'request' | 'response'; group?: string; field?: string };
function selectionGroups(topic: DocTopic, view: DocSelection['view']): SchemaGroup[] {
  if (topic.endpoint) return view === 'response' ? topic.endpoint.response : [{ title: 'Request', fields: topic.endpoint.request }];
  return topic.id === 'filters' ? filterGroups : [];
}

/** Links contain only known public schema names, never the user's search text. */
export function resolveDocSelection(topic: DocTopic, params: URLSearchParams): DocSelection {
  const view = topic.endpoint && params.get('view') === 'response' ? 'response' : 'request';
  const group = selectionGroups(topic, view).find(item => item.title === params.get('group'));
  const field = group?.fields.find(item => item.name === params.get('field'));
  return { view, ...(group && field ? { group: group.title, field: field.name } : {}) };
}

/** A matching field opens its actual request/response schema, including nested groups. */
export function searchDocSelection(topic: DocTopic, query: string): DocSelection {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 16);
  if (!words.length) return { view: 'request' };
  const views: DocSelection['view'][] = topic.endpoint ? ['request', 'response'] : ['request'];
  const matches = views.flatMap(view => selectionGroups(topic, view).flatMap(group => group.fields.map(field => {
    const name = field.name.toLowerCase(), text = `${group.title} ${field.name} ${field.type} ${field.description}`.toLowerCase();
    const score = words.every(word => text.includes(word)) ? words.reduce((sum, word) => sum + (name === word ? 6 : name.includes(word) ? 3 : 1), 0) : 0;
    return { view, group: group.title, field: field.name, score };
  }))).filter(match => match.score > 0).sort((a, b) => b.score - a.score);
  const match = matches[0];
  return match ? { view: match.view, group: match.group, field: match.field } : { view: 'request' };
}

export function docHref(id: string, selection: Partial<DocSelection> = {}): string {
  const topic = DOC_TOPICS.find(item => item.id === id) ?? DOC_TOPICS[0];
  const known = resolveDocSelection(topic, new URLSearchParams({ view: selection.view ?? '', group: selection.group ?? '', field: selection.field ?? '' }));
  const params = new URLSearchParams({ section: 'docs' });
  if (known.view === 'response') params.set('view', known.view);
  if (known.group && known.field) { params.set('group', known.group); params.set('field', known.field); }
  return `/api?${params}#${topic.id}`;
}
function pythonValue(value: unknown, depth = 0): string {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (Array.isArray(value)) return `[${value.map(item => pythonValue(item, depth + 1)).join(', ')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{\n${entries.map(([key, item]) => `${'  '.repeat(depth + 1)}${JSON.stringify(key)}: ${pythonValue(item, depth + 1)}`).join(',\n')}\n${'  '.repeat(depth)}}`;
  }
  return JSON.stringify(value);
}
export function buildApiExample(endpoint: ApiEndpoint, language: ExampleLanguage): string {
  const url = `${API_BASE_URL}${endpoint.path.replace(':ip', '192.0.2.10')}`;
  const body = endpoint.method === 'POST' ? endpoint.exampleBody ?? {} : undefined;
  if (language === 'curl') {
    const lines = [`curl --request ${endpoint.method} "${url}"`, '  --header "X-API-Key: $APCOSYS_API_KEY"'];
    if (body) lines.push('  --header "Content-Type: application/json"', `  --data-raw '${JSON.stringify(body, null, 2)}'`);
    return lines.join(' \\\n');
  }
  if (language === 'javascript') {
    return `// Run on your server with APCOSYS_API_KEY set.\nconst response = await fetch(${JSON.stringify(url)}, {\n  method: ${JSON.stringify(endpoint.method)},\n  headers: {\n    "X-API-Key": process.env.APCOSYS_API_KEY${body ? ',\n    "Content-Type": "application/json"' : ''}\n  }${body ? `,\n  body: JSON.stringify(${JSON.stringify(body, null, 2).replace(/\n/g, '\n  ')})` : ''}\n});\n\nif (!response.ok) {\n  throw new Error(\`\${response.status}: \${await response.text()}\`);\n}\nconsole.log(await response.json());`;
  }
  return `import json\nimport os\nfrom urllib.request import Request, urlopen\n\n${body ? `payload = ${pythonValue(body)}\n\n` : ''}request = Request(\n    ${JSON.stringify(url)},\n    method=${JSON.stringify(endpoint.method)},\n    headers={\n        "X-API-Key": os.environ["APCOSYS_API_KEY"]${body ? ',\n        "Content-Type": "application/json"' : ''}\n    }${body ? ',\n    data=json.dumps(payload).encode("utf-8")' : ''}\n)\nwith urlopen(request) as response:\n    print(json.load(response))`;
}
