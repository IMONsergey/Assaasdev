import { describe, expect, it } from 'vitest';
import { matchingHosts } from './search';
import type { DemoHost } from './fixtures';

const host = { host: 'research.example', taskId: 'task-one', card: { ip: '192.0.2.1' }, detail: { ip: '192.0.2.1', ports: [{ title: 'Research "console"', headers: { Server: ['Research server'], 'Content-Type': ['application/json'] }, banner_sha256: 'a'.repeat(64) }] } } as DemoHost;
describe('presentation searches from host evidence', () => {
  it('finds the originating title, header and fingerprint after a field pivot', () => {
    for (const [field, value] of [['title', JSON.stringify('Research "console"')], ['headers.server', 'Research server'], ['headers.Content-Type', 'application/json'], ['banner_sha256', 'a'.repeat(64)]]) expect(matchingHosts([host], { simple_search_filters: [{ field, value }] })).toEqual([host]);
  });
  it('retains exact matching, nested conditions and private task boundaries', () => {
    expect(matchingHosts([host], { simple_search_filters: [{ field: 'title', value: 'Research' }] })).toEqual([]);
    expect(matchingHosts([host], { task_ids: ['different'], simple_search_filters: [{ field: 'headers.server', value: 'Research server' }] }, true)).toEqual([]);
    expect(matchingHosts([host], { simple_search_filters: [{ operator: 'NOT', filters: [{ field: 'headers.server', value: 'Research server' }] }] })).toEqual([]);
  });
});
