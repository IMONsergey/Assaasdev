import { describe, expect, it } from 'vitest';
import type { PortRecord } from '../../api';
import { displayValue, filterServices, hostWorkspace, mappedDomains, portRange, safeBackPath, serviceItems, servicePage, serviceSummary } from './model';

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
  it('normalizes product strings and CVE scores without mutating the complete response', () => {
    const raw = { port: 443, detected_products: [null, { product: { name: 'bad product' }, vendor: 0, version: false, cve_identifier: ['CPE'], labels: ['web', null], cve_list: [null, { cve_id: 'CVE-2026-0001', base_score: 0 }, { cve_id: { invalid: true }, base_score: NaN }, { cve_id: 'CVE-2026-0002', base_score: 11 }], exposed_data: { field_headers: ['Value'], field_value: [[0], [null]] } }] } as unknown as PortRecord;
    const [item] = serviceItems([raw]);
    expect(item.invalidFields).toContain('detected_products');
    expect(item.record.detected_products).toHaveLength(1);
    expect(item.record.detected_products?.[0]).toMatchObject({ labels: ['web'], cve_list: [{ cve_id: 'CVE-2026-0001', base_score: 0 }, {}, { cve_id: 'CVE-2026-0002' }], exposed_data: { field_value: [[0], [null]] } });
    expect(item.record.detected_products?.[0].product).toBeUndefined();
    expect(item.record.detected_products?.[0].cve_list?.[2].base_score).toBeUndefined();
    expect(item.rawRecord).toBe(raw);
    expect(raw.detected_products?.[1].product).toEqual({ name: 'bad product' });
    expect(mappedDomains([null, undefined, { d: 'one.test' }, { d: 0 }, { d: 'one.test' }, { d: 'two.test' }] as never)).toEqual(['one.test', 'two.test']);
  });
  it('computes scoped counts from received observations and separates missing from zero', () => {
    const items = serviceItems([{ port: 0, protocol: 'HTTPS ', detected_products: [{ product: 'Server', version: '1', cve_list: [{ cve_id: 'CVE-2026-0001', base_score: 0 }] }] }, { port: 443, protocol: 'https', detected_products: [{ product: 'Server', version: '1', cve_list: [{ cve_id: 'cve-2026-0001' }] }] }, { port: 443, protocol: 'ssh', detected_products: [] }]);
    const summary = serviceSummary(items, true);
    expect(summary).toMatchObject({ services: 3, ports: 2, productRecords: 2, cves: 1, protocols: [{ name: 'https', count: 2 }, { name: 'ssh', count: 1 }] });
    expect(summary.products[0]).toMatchObject({ name: 'Server', count: 2 });
    expect(filterServices(items, '', 'received', { protocol: 'https' })).toHaveLength(2);
    expect(serviceSummary([], false)).toMatchObject({ services: undefined, ports: undefined, productRecords: undefined, cves: undefined });
    expect(serviceSummary([], true)).toMatchObject({ services: 0, ports: 0, productRecords: 0, cves: 0 });
    expect(serviceSummary([], true, 2)).toMatchObject({ services: undefined, ports: undefined, productRecords: undefined, cves: undefined });
    expect(serviceSummary(serviceItems([{ port: 443 }]), true)).toMatchObject({ services: 1, productRecords: undefined, cves: undefined });
    expect(serviceSummary(serviceItems([{ port: 443, detected_products: [null] } as unknown as PortRecord]), true)).toMatchObject({ services: 1, productRecords: undefined, cves: undefined });
  });
  it('keeps every legacy detail link and explicit workspace destination reachable', () => {
    expect(hostWorkspace(new URLSearchParams())).toMatchObject({ tab: 'overview', detailOpen: false });
    expect(hostWorkspace(new URLSearchParams('port=0'))).toMatchObject({ tab: 'services', detailOpen: true });
    expect(hostWorkspace(new URLSearchParams('service=key&panel=list'))).toMatchObject({ tab: 'services', detailOpen: false });
    expect(hostWorkspace(new URLSearchParams('tab=overview&port=443'))).toMatchObject({ tab: 'overview' });
    for (const [legacy, serviceTab] of [['http', 'response'], ['tls', 'tls'], ['products', 'products'], ['exposed', 'exposed'], ['security', 'web'], ['robots', 'web']]) expect(hostWorkspace(new URLSearchParams(`tab=${legacy}`))).toMatchObject({ tab: 'services', serviceTab, detailOpen: true });
    expect(hostWorkspace(new URLSearchParams('tab=http'))).toMatchObject({ responseTab: 'body' });
    expect(hostWorkspace(new URLSearchParams('tab=robots'))).toMatchObject({ webTab: 'robots' });
    expect(hostWorkspace(new URLSearchParams('tab=services&view=web&file=robots'))).toMatchObject({ tab: 'services', serviceTab: 'web', webTab: 'robots' });
    expect(hostWorkspace(new URLSearchParams('tab=constructor'))).toMatchObject({ tab: 'overview', serviceTab: 'response' });
  });
});
