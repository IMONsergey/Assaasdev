import { describe, expect, it } from 'vitest';
import { buildScanRequest, DEFAULT_SCAN_PORTS, findCreatedTask, normalizeHost, parseCidr, parsePorts, sameScope, scannerAccessDenied, taskGroup, taskProgress, taskResultsLabel, validateCron } from '../../src/features/scanner/model';
import { ApiError } from '../../src/api';

describe('private scan review contract', () => {
  it('estimates IPv4 using network and broadcast exclusion and omits workers', () => {
    const built = buildScanRequest({ hosts: '', cidrs: '192.0.2.0/28', ports: '80,443', scheduling: 'once', cron: '' });
    expect(built.valid).toBe(true);
    expect(built.knownTargetCount).toBe(14n);
    expect(built.estimate).toBe(28n);
    expect(built.request).not.toHaveProperty('workers');
    expect(built.request.schedule).toBe('');
  });
  it('expands the exact ten defaults and explicit port ranges without duplicates', () => {
    expect(parsePorts('')).toEqual(DEFAULT_SCAN_PORTS);
    expect(parsePorts('80,443,8000-8002,80')).toEqual([80,443,8000,8001,8002]);
    expect(() => parsePorts('0,443')).toThrow();
    expect(() => parsePorts('65536')).toThrow();
    expect(() => parsePorts('90-80')).toThrow();
  });
  it('keeps IPv6 arithmetic exact and does not invent /31 or /32 billing policy', () => {
    expect(parseCidr('2001:db8::/64').count).toBe(18446744073709551616n);
    expect(parseCidr('2001:db8::1/128').count).toBe(1n);
    expect(parseCidr('192.0.2.0/31').count).toBeUndefined();
    expect(parseCidr('192.0.2.1/32').count).toBeUndefined();
  });
  it('normalizes target input visibly and rejects ambiguous URLs', () => {
    expect(normalizeHost('EXAMPLE.COM')).toBe('example.com');
    expect(normalizeHost('2001:db8::1')).toBe('2001:db8::1');
    expect(() => normalizeHost('https://example.com')).toThrow();
    expect(() => normalizeHost('999.0.0.1')).toThrow();
    expect(() => parseCidr('example.com/24')).toThrow();
    const built = buildScanRequest({ hosts: 'example.com\nEXAMPLE.COM', cidrs: '', ports: '', scheduling: 'once', cron: '' });
    expect(built.request.host_list).toEqual(['example.com']);
    expect(built.warnings).toHaveLength(1);
    expect(built.estimate).toBe(10n);
  });
  it('validates six Cron fields and preserves unknown scanner status', () => {
    expect(validateCron('0 0 3 * * *')).toBe('0 0 3 * * *');
    expect(validateCron('0 */5 * * * MON-FRI')).toBe('0 */5 * * * MON-FRI');
    expect(() => validateCron('0 3 * * *')).toThrow();
    expect(() => validateCron('60 0 3 * * *')).toThrow();
    expect(() => validateCron('*/0 0 3 * * *')).toThrow();
    expect(taskGroup('custom_backend_status')).toBe('other');
    expect(taskProgress({ id: 't', done_task_count: 0, task_count: 4 })).toBe(0);
    expect(taskResultsLabel({ id: 't', result_count: 0 })).toBe('0');
  });
  it('distinguishes an explicit one-time creation from an update that keeps the existing schedule', () => {
    const request = { host_list: ['example.com'], cidr_list: [], port_list: [443], schedule: '' };
    const recurring = { ...request, id: 'recurring', schedule: '0 0 3 * * *' };
    expect(sameScope(recurring, request)).toBe(false);
    expect(sameScope({ ...recurring, schedule: undefined }, request)).toBe(false);
    expect(sameScope(recurring, { ...request, schedule: undefined })).toBe(true);
    expect(sameScope({ ...recurring, schedule: '' }, request)).toBe(true);
  });
  it('does not confirm a lost create response from an ambiguous or already-known task', () => {
    const request = { host_list: ['example.com'], port_list: [443], schedule: '' };
    const first = { ...request, id: 'first' }, second = { ...request, id: 'second' };
    expect(findCreatedTask([first], request, ['first'])).toBeUndefined();
    expect(findCreatedTask([first, second], request, [])).toBeUndefined();
    expect(findCreatedTask([first, first], request, [])?.id).toBe('first');
    expect(findCreatedTask([first, second], request, ['first'])?.id).toBe('second');
    expect(findCreatedTask([{ ...first, schedule: '0 0 3 * * *' }], request, [])).toBeUndefined();
  });
  it('keeps network and server failures separate from an explicit scanner access denial', () => {
    expect(scannerAccessDenied(new ApiError('server', 'Business subscription required'))).toBe(true);
    expect(scannerAccessDenied(new ApiError('server', 'Forbidden', { status: 403 }))).toBe(true);
    expect(scannerAccessDenied(new ApiError('transport', 'Connection closed'))).toBe(false);
    expect(scannerAccessDenied(new ApiError('server', 'Scanner service unavailable', { status: 503 }))).toBe(false);
    expect(scannerAccessDenied(new ApiError('rate', 'Too many requests'))).toBe(false);
    expect(scannerAccessDenied(null)).toBe(false);
  });
});
