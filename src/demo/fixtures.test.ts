import { describe, expect, it } from 'vitest';
import { seedBuckets, seedHosts } from './fixtures';
import { matchingBuckets, matchingHosts } from './search';
import { securitySummary, robotsSummary } from '../features/hosts/web-files';

describe('searchable presentation examples', () => {
  it('opens populated data and web files from the normal nginx search', () => {
    const [host] = matchingHosts(seedHosts(), { full_text_search: 'nginx', sort_field: 'uts', sort_direction: 'desc' });
    const service = host.detail.ports![0];
    expect(host.card.ip).toBe('192.0.2.10');
    expect(service.detected_products?.map(product => product.exposed_data?.field_value?.length)).toEqual([72, 2048]);
    expect(Object.fromEntries(securitySummary(service.security_txt)).Contacts).toContain('mailto:security@example.com');
    expect(Object.fromEntries(robotsSummary(service.robots_txt))['User agents']).toEqual(['*', 'ExampleBot']);
  });
  it('provides three buckets, long names, zero-size files and a paginated report collection', () => {
    const files = seedBuckets();
    const reports = matchingBuckets(files, { key_words: ['reports'] });
    expect(files).toHaveLength(1220);
    expect(reports).toHaveLength(1204);
    expect(new Set(reports.map(file => `${file.host}/${file.container || ''}`)).size).toBe(3);
    expect(matchingBuckets(files, { key_words: ['brochure'] })).toHaveLength(3);
    expect(matchingBuckets(files, { key_words: ['assets'] })).toHaveLength(6);
    expect(matchingBuckets(files, { key_words: ['assets'] }).some(file => file.key!.length > 1000 && file.key!.endsWith('final-preview.png'))).toBe(true);
    expect(matchingBuckets(files, { key_words: ['empty'] }).every(file => file.size_mb === 0)).toBe(true);
    expect(matchingBuckets(files, { min_size_mb: 8000 })[0].key).toBe('archive/documentation-snapshot.zip');
  });
});
