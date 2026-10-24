import { describe, expect, it } from 'vitest';
import { formatUtcSeconds, parseUtcSeconds } from './date-input';

describe('UTC observation date inputs', () => {
  it('round-trips seconds without applying the browser time zone or dropping zero', () => {
    for (const timestamp of [0, -1, 1709251199, 1761442200]) {
      expect(parseUtcSeconds(formatUtcSeconds(timestamp)!)).toBe(timestamp);
    }
    expect(formatUtcSeconds(0)).toBe('1970-01-01T00:00:00');
    expect(parseUtcSeconds('1970-01-01T00:00')).toBe(0);
    expect(parseUtcSeconds('2024-02-29T23:59:59')).toBe(1709251199);
  });
  it('leaves opaque or unrepresentable ranges in the raw editor', () => {
    expect(formatUtcSeconds(undefined)).toBe('');
    for (const value of ['0', 'now-30d', 0.5, Infinity, 253402300800]) expect(formatUtcSeconds(value)).toBeNull();
    expect(parseUtcSeconds('')).toBeUndefined();
  });
  it('rejects calendar rollover and implicit local-time offsets', () => {
    for (const value of ['2025-02-29T12:00', '2024-04-31T00:00', '2024-01-01T24:00', '2024-01-01T12:00+03:00', 'not a date']) {
      expect(() => parseUtcSeconds(value)).toThrow('valid UTC date');
    }
  });
});
