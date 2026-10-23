import { describe, expect, it } from 'vitest';
import { displayValue, filterServices, mappedDomains, safeBackPath, serviceItems, servicePage } from './model';

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
});
