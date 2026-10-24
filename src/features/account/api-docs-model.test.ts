import { describe, expect, it } from 'vitest';
import { API_BASE_URL, API_ENDPOINTS, API_PLANS, DOC_TOPICS, buildApiExample, docHref, resolveDocSelection, resolveDocTopic, searchDocSelection, searchDocTopics } from './api-docs-model';

describe('published HTTP API reference', () => {
  it('covers the eight official endpoints without inventing a route or duplicating the version prefix', () => {
    expect(API_BASE_URL).toBe('https://api.apcosys.net/api/v1');
    expect(API_ENDPOINTS.map(item => `${item.method} ${item.path}`)).toEqual([
      'POST /search/hosts', 'GET /search/hosts/:ip', 'POST /search/analytics',
      'POST /search/buckets', 'POST /search/buckets/analytics',
      'POST /search/private/hosts', 'GET /search/private/hosts/:ip', 'POST /search/private/analytics',
    ]);
    for (const endpoint of API_ENDPOINTS) {
      const curl = buildApiExample(endpoint, 'curl');
      expect(curl).toContain('X-API-Key: $APCOSYS_API_KEY');
      expect(curl).not.toContain('/api/v1/api/v1');
      expect(curl).not.toContain(':ip');
      expect(curl.includes('--data-raw')).toBe(endpoint.method === 'POST');
      expect(endpoint.response.length).toBeGreaterThan(0);
    }
  });
  it('keeps public documentation examples independent of a signed-in account or secret', () => {
    for (const endpoint of API_ENDPOINTS) {
      expect(buildApiExample(endpoint, 'javascript')).toContain('process.env.APCOSYS_API_KEY');
      expect(buildApiExample(endpoint, 'python')).toContain('os.environ["APCOSYS_API_KEY"]');
      expect(buildApiExample(endpoint, 'javascript')).toContain('if (!response.ok)');
      expect(buildApiExample(endpoint, 'javascript').includes('body: JSON.stringify')).toBe(endpoint.method === 'POST');
      expect(buildApiExample(endpoint, 'python').includes('data=json.dumps(payload)')).toBe(endpoint.method === 'POST');
      if (endpoint.path.includes('/private/')) expect(endpoint.access).toBe('Business');
    }
  });
  it('preserves documented differences between host and bucket pagination and sort', () => {
    const hosts = API_ENDPOINTS.find(item => item.id === 'search-hosts')!;
    const buckets = API_ENDPOINTS.find(item => item.id === 'search-buckets')!;
    expect(hosts.request.find(item => item.name === 'docs_per_page')?.description).toContain('Maximum 100');
    expect(buckets.request.find(item => item.name === 'docs_per_page')?.description).not.toContain('100');
    expect(hosts.request.find(item => item.name === 'sort_field')?.description).toContain('Ignored');
    expect(buckets.request.find(item => item.name === 'sort_field')?.defaultValue).toBe('cts');
    expect(API_PLANS.map(item => [item.name, item.rps, item.pages])).toEqual([['Free', 0, 2], ['Plus', 1, 25], ['Expert', 2, 150], ['Business', 5, 300]]);
  });
});

describe('documentation navigation', () => {
  it('restores valid anchors and safely falls back for malformed or unknown links', () => {
    for (const topic of DOC_TOPICS) {
      expect(resolveDocTopic(`#${topic.id}`).id).toBe(topic.id);
      expect(docHref(topic.id)).toBe(`/api?section=docs#${topic.id}`);
    }
    expect(resolveDocTopic('#%E0%A4%A').id).toBe('getting-started');
    expect(resolveDocTopic('#no-such-endpoint').id).toBe('getting-started');
    expect(docHref('<script>')).toBe('/api?section=docs#getting-started');
  });
  it('finds real schema fields, status codes and private routes across articles', () => {
    expect(searchDocTopics('tls_info ja4s').some(item => item.id === 'get-host')).toBe(true);
    expect(searchDocTopics('X-API-Key')[0].id).toBe('authentication');
    expect(searchDocTopics('429').some(item => item.id === 'errors')).toBe(true);
    expect(searchDocTopics('/search/private/hosts').map(item => item.id)).toContain('private-hosts');
    expect(searchDocTopics('EXCLUDE_EXTENSIONS').some(item => item.id === 'search-buckets')).toBe(true);
    expect(searchDocTopics('private analytics')[0].id).toBe('private-analytics');
    expect(searchDocTopics('  ')).toHaveLength(DOC_TOPICS.length);
    expect(searchDocTopics('not-a-real-field-832')).toEqual([]);
  });
  it('takes a schema search to the matching request or nested response field', () => {
    const host = resolveDocTopic('#get-host'), buckets = resolveDocTopic('#search-buckets');
    expect(searchDocSelection(host, 'tls_info ja4s')).toEqual({ view: 'response', group: 'ports[].tls_info', field: 'ja4s' });
    expect(searchDocSelection(buckets, 'exclude_extensions')).toEqual({ view: 'request', group: 'Request', field: 'exclude_extensions' });
    expect(searchDocSelection(resolveDocTopic('#filters'), 'tls_info.ja4s')).toEqual({ view: 'request', group: 'Headers & TLS', field: 'tls_info.ja4s' });
    expect(searchDocTopics('ports[].tls_info').some(topic => topic.id === 'get-host')).toBe(true);
    expect(searchDocSelection(host, '')).toEqual({ view: 'request' });
  });
  it('round-trips a public schema destination and drops unknown field or view parameters', () => {
    const topic = resolveDocTopic('#get-host');
    const selection = searchDocSelection(topic, 'tls_info ja4s');
    const url = new URL(docHref(topic.id, selection), 'https://docs.example');
    expect(resolveDocSelection(topic, url.searchParams)).toEqual(selection);
    expect(url.hash).toBe('#get-host');
    expect(url.searchParams.has('q')).toBe(false);
    expect(docHref(topic.id, { view: 'response', group: 'secret', field: 'not-a-public-field' })).toBe('/api?section=docs&view=response#get-host');
    expect(resolveDocSelection(topic, new URLSearchParams('view=invalid&group=ports%5B%5D.tls_info&field=ja4s'))).toEqual({ view: 'request' });
    expect(docHref('errors', selection)).toBe('/api?section=docs#errors');
  });
});
