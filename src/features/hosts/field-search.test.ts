import { describe, expect, it } from 'vitest';
import { fieldSearchHref } from './field-search';

describe('host field search drafts', () => {
  it('creates a new exact-field draft and drops host-bound data and tokens', () => {
    const source = new URLSearchParams({ request: JSON.stringify({ ip: '192.0.2.1', full_text_search: 'old query', page: 7, st: 'secret', share_token: 'secret-again', task_ids: ['task-private'] }), st: 'url-secret' });
    const url = new URL(fieldSearchHref('title', 'A "quoted" title', '/hosts/192.0.2.1', source.toString())!, 'https://workspace.test');
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('draft')).toBe('1');
    expect(url.searchParams.has('run')).toBe(false);
    expect(url.search).not.toMatch(/secret|old\+query|task-private/);
    expect(JSON.parse(url.searchParams.get('request')!)).toEqual({ simple_search_filters: [{ field: 'title', value: '"A \\"quoted\\" title"'.replaceAll('\\\\', '\\') }], page: 1, docs_per_page: 20, sort_field: 'uts', sort_direction: 'desc' });
  });
  it('preserves private task scope and a local scanner return while accepting zero values', () => {
    const source = new URLSearchParams({ request: JSON.stringify({ task_ids: ['one', 'two'], full_text_search: 'old' }), scanner_back: '/scanner?section=history', st: 'sensitive' });
    const url = new URL(fieldSearchHref('status_code', 0, '/private/hosts/192.0.2.1', source.toString())!, 'https://workspace.test');
    expect(url.pathname).toBe('/private/search');
    expect(JSON.parse(url.searchParams.get('request')!).task_ids).toEqual(['one', 'two']);
    expect(JSON.parse(url.searchParams.get('request')!).simple_search_filters).toEqual([{ field: 'status_code', value: '0' }]);
    expect(url.searchParams.get('scanner_back')).toBe('/scanner?section=history');
    source.set('scanner_back', '//external.test');
    expect(new URL(fieldSearchHref('protocol', 'https', '/private/hosts/192.0.2.1', source.toString())!, 'https://workspace.test').searchParams.has('scanner_back')).toBe(false);
  });
  it('does not create links for absent, malformed or unbounded values', () => {
    for (const value of [null, undefined, '', ' ', {}, ['one'], NaN, Infinity, 'a'.repeat(4097)]) expect(fieldSearchHref('title', value, '/hosts/example.test', '')).toBeNull();
  });
});
