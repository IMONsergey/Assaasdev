import { describe, expect, it } from 'vitest';
import { activeFacetValues, analyticsRequest, decodeSearch, encodeSearch, facetUnit, searchAccessIssues, selectedType, validateSearchRequest, withType, withoutShareToken, toggleFacet } from './model';

describe('search context', () => {
  it('round-trips the complete search body and separately restores a share token', () => {
    const request = { page: 3, docs_per_page: 25, full_text_search: 'nginx', task_ids: ['task_1042'], range_filter: [{ field: 'uts', start: 0, end: 200 }], simple_search_filters: [{ operator: 'OR' as const, filters: [{ field: 'port', value: '80' }, { field: 'port', value: '443' }] }], robots_body: 'Disallow', st: 'token' };
    expect(decodeSearch(new URLSearchParams(encodeSearch(request))).request).toEqual(request);
    expect(withoutShareToken(request)).not.toHaveProperty('st');
  });
  it('reuses analytics across presentation changes but preserves exact shared payloads', () => {
    const request = { full_text_search: 'nginx', task_ids: ['task_1042'], page: 1, docs_per_page: 10, sort_field: 'uts', sort_direction: 'desc' };
    const changed = { ...request, page: 2, docs_per_page: 50, sort_field: 'ip', sort_direction: 'asc' };
    expect(analyticsRequest(request)).toEqual(analyticsRequest(changed));
    expect(analyticsRequest(request)).toEqual({ full_text_search: 'nginx', task_ids: ['task_1042'] });
    expect(analyticsRequest({ ...changed, st: 'exact-body' })).toEqual({ ...changed, st: 'exact-body' });
  });
  it('combines values within one facet with OR and toggles without duplicate conditions', () => {
    const first = toggleFacet({ page: 3, full_text_search: 'nginx' }, 'country_name', 'Germany');
    const second = toggleFacet(first, 'country_name', 'France');
    const both = toggleFacet(second, 'protocol', 'https');
    expect(both.simple_search_filters).toEqual([{ operator: 'OR', filters: [{ field: 'country_name', value: 'Germany' }, { field: 'country_name', value: 'France' }] }, { field: 'protocol', value: 'https' }]);
    expect(both.page).toBe(1);
    expect(activeFacetValues(both, 'country_name')).toEqual(['Germany', 'France']);
    expect(activeFacetValues(toggleFacet(both, 'country_name', 'Germany'), 'country_name')).toEqual(['France']);
    expect(activeFacetValues(toggleFacet(first, 'country_name', 'Germany'), 'country_name')).toEqual([]);
  });
  it('does not rewrite mixed or negated conditions when changing a facet', () => {
    const complex = { operator: 'NOT' as const, filters: [{ field: 'country_name', value: 'France' }] };
    const request = toggleFacet({ simple_search_filters: [complex] }, 'country_name', 'Germany');
    expect(request.simple_search_filters?.[0]).toEqual(complex);
    expect(activeFacetValues(request, 'country_name')).toEqual(['Germany']);
  });
  it('does not inject defaults into exact shared bodies', () => {
    expect(decodeSearch(new URLSearchParams('request=%7B%22host%22%3A%22example.com%22%7D&st=x')).request).toEqual({ host: 'example.com', st: 'x' });
  });
  it('replaces type without dropping unrelated nested conditions', () => {
    const next = withType({ simple_search_filters: [{ operator: 'AND', filters: [{ field: 'type', value: 'ipv4' }, { operator: 'NOT', filters: [{ field: 'country_name', value: 'France' }] }] }] }, 'ipv6');
    expect(selectedType(next)).toBe('ipv6');
    expect(JSON.stringify(next)).toContain('France');
    expect(JSON.stringify(next)).not.toContain('ipv4');
  });
  it('rejects incomplete groups and invalid ranges instead of silently changing the search', () => {
    expect(() => validateSearchRequest({ simple_search_filters: [{ operator: 'AND', filters: [] }] })).toThrow();
    expect(() => validateSearchRequest({ min_size_mb: 10, max_size_mb: 1 })).toThrow();
    expect(decodeSearch(new URLSearchParams('request={')).error).toBeTruthy();
  });
  it('preserves zero and distinguishes facet counting units', () => {
    expect(validateSearchRequest({ min_size_mb: 0 }).min_size_mb).toBe(0);
    expect(facetUnit('country_name')).toBe('Hosts');
    expect(facetUnit('port')).toBe('Records');
  });
  it('keeps conditional type logic visibly custom and checks nested access restrictions', () => {
    const request = { simple_search_filters: [{ operator: 'NOT' as const, filters: [{ field: 'type', value: 'ipv4' }, { field: 'labels', value: 'leak' }] }], min_size_mb: 0 };
    expect(selectedType(request)).toBe('custom');
    expect(searchAccessIssues(request, { blocked_fields: ['min_size_mb'], blocked_values: ['leak'] })).toHaveLength(1);
    expect(searchAccessIssues({ ...request, st: 'creator-access' }, { blocked_values: ['leak'] })).toEqual([]);
    expect(() => validateSearchRequest({ range_filter: [{ field: 'uts', start: '20', end: '10' }] })).toThrow();
  });
});
