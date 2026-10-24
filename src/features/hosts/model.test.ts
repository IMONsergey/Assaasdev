import { describe, expect, it } from 'vitest';
import type { PortRecord } from '../../api';
import { displayValue, filterServices, mappedDomains, portRange, safeBackPath, serviceItems, servicePage } from './model';

describe('received host records', () => {
  it('keeps same-port transport and server contexts separate', () => {
    const items = serviceItems([{ port: 443, transport: 'TCP', protocol: 'https', link: 'https://a.test' }, { port: 443, transport: 'UDP', protocol: 'quic', link: 'https://a.test' }, { port: 443, transport: 'TCP', protocol: 'https', link: 'https://b.test' }, { port: 443, transport: 'TCP', protocol: 'https', link: 'https://a.test' }]);
    expect(new Set(items.map(item => item.key)).size).toBe(4);
    expect(filterServices(items, 'b.test', 'received')).toHaveLength(1);
    expect(filterServices(items, 'udp', 'received')[0].record.protocol).toBe('quic');
  });
  it('paginates only the received array and clamps a filtered page', () => {
    const items = serviceItems(Array.from({ length: 1000 }, (_, index) => ({ port: index + 1 })));
    const second = servicePage(items, 2);
    expect([second.start, second.end, second.rows.length, second.totalPages]).toEqual([26, 50, 25, 40]);
    expect(servicePage(filterServices(items, '1000', 'port-asc'), 40)).toMatchObject({ page: 1, start: 1, end: 1, totalPages: 1 });
    expect(servicePage([], 1)).toMatchObject({ start: 0, end: 0, rows: [] });
  });
  it('preserves zero and false and recognizes absent data', () => {
    expect(displayValue(0)).toBe('0');
    expect(displayValue(false)).toBe('No');
    expect(displayValue(undefined)).toBe('Not provided');
    expect(displayValue(null)).toBe('No value returned');
    expect(displayValue('')).toBe('Empty value');
    expect(displayValue([])).toBe('None returned');
  });
  it('only restores a local results route and handles domain map shapes', () => {
    expect(safeBackPath('//evil.test/path', '/search')).toBe('/search');
    expect(safeBackPath('/private/search?request=%7B%7D', '/search')).toBe('/private/search?request=%7B%7D');
    expect(safeBackPath('/auth/logout', '/search')).toBe('/search');
    expect(mappedDomains([{ d: 'a.test' }, { d: 'a.test' }, { d: 'b.test' }])).toEqual(['a.test', 'b.test']);
  });
  it('classifies the full received set by protocol, content and exact port range', () => {
    const items = serviceItems(Array.from({ length: 1000 }, (_, index) => ({ port: 10000 + index, protocol: index % 2 === 0 ? 'HTTPS' : 'ssh', body: index === 998 ? 'Unique response marker' : '', tls_info: index % 10 === 0 ? { server_name: `host-${index}.test` } : undefined })));
    expect(filterServices(items, '', 'port-desc', { protocol: 'https', content: 'tls', port: '10800-10999' })).toHaveLength(20);
    expect(filterServices(items, 'unique response marker', 'received', { protocol: 'https' })[0].record.port).toBe(10998);
    expect(filterServices(items, '', 'received', { port: '1000-1' })).toEqual([]);
    expect(portRange('65535')).toEqual({ start: 65535, end: 65535 });
    expect(portRange('0–443')).toEqual({ start: 0, end: 443 });
    expect(portRange('65536')).toBeUndefined();
  });
  it('keeps duplicate observations and isolates malformed ports without losing raw values', () => {
    const records = [{ port: NaN, protocol: 4 }, { port: Infinity }, { port: 70000 }, { port: 443, protocol: 'https' }, { port: 443, protocol: 'https' }, null] as unknown as PortRecord[];
    const items = serviceItems(records);
    expect(items).toHaveLength(5);
    expect(new Set(items.map(item => item.key)).size).toBe(5);
    expect(items[0].record.port).toBeUndefined();
    expect(items[0].invalidFields).toEqual(['port', 'protocol']);
    expect(items[0].rawRecord.port).toBeNaN();
    expect(filterServices(items, '', 'port-asc').slice(0, 2).map(item => item.record.port)).toEqual([443, 443]);
    expect(serviceItems({} as PortRecord[])).toEqual([]);
  });
});
