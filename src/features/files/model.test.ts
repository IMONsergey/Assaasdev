import { describe, expect, it } from 'vitest';
import { DEFAULT_FILE_DRAFT, draftFromFilter, fileParams, fileSize, filterChips, filterFromDraft, middleTruncate, nameParts, normalizeBucketFilter, observedFileUrl, readFileParams, utcInput, utcSeconds } from './model';

describe('file search contract and view model', () => {
  it('round-trips every applied bucket parameter without dropping zero or exclusions', () => {
    const filter = filterFromDraft({ ...DEFAULT_FILE_DRAFT, host: 'storage.example.com/public', keywords: 'report, 2026', stopWords: 'tmp, backup', extensions: '.pdf, txt, pdf', excludeExtensions: true, products: 'azureblobstorage, custom_detector', alphabets: 'latin, custom_alphabet', minSize: '0', maxSize: '10.5', discoveredFrom: '2026-10-01T00:00:00', discoveredTo: '2026-10-23T23:59:59', updatedFrom: '2026-10-02T12:30', updatedTo: '2026-10-23T20:00', sort: 'size_mb:asc', pageSize: '50' });
    expect(filter).toMatchObject({ min_size_mb: 0, max_size_mb: 10.5, exclude_extensions: true, extensions: ['pdf', 'txt'], docs_per_page: 50, sort_field: 'size_mb', sort_direction: 'asc', page: 1 });
    expect(filterFromDraft(draftFromFilter(filter))).toEqual(filter);
    const restored = readFileParams(fileParams({ ...filter, page: 2 }, 'hosts'));
    expect(restored.error).toBeUndefined(); expect(restored.view).toBe('hosts'); expect(restored.filter).toEqual({ ...filter, page: 2 }); expect(restored.restored).toBe(true);
  });

  it('uses UTC seconds and inclusive bounds without timezone-dependent conversion', () => {
    expect(utcSeconds('2026-10-23T12:30:45')).toBe(Date.UTC(2026, 9, 23, 12, 30, 45) / 1000);
    expect(utcInput(utcSeconds('2026-10-23T12:30'))).toBe('2026-10-23T12:30:00');
    expect(() => utcSeconds('2026-02-30T12:00')).toThrow('valid UTC');
    expect(() => utcSeconds('2026-10-23')).toThrow('complete date');
    expect(() => filterFromDraft({ ...DEFAULT_FILE_DRAFT, updatedFrom: '2026-10-24T00:00', updatedTo: '2026-10-23T00:00' })).toThrow('minimum updated date');
    expect(() => normalizeBucketFilter({ gte_uts: Number.MAX_SAFE_INTEGER })).toThrow('date range');
  });

  it('distinguishes unknown size, observed zero and small values', () => {
    expect(fileSize(undefined)).toBe('Not observed'); expect(fileSize(0)).toBe('0 MB'); expect(fileSize(0.0004)).toBe('<0.001 MB'); expect(fileSize(12.5)).toBe('12.5 MB');
    const filter = filterFromDraft({ ...DEFAULT_FILE_DRAFT, minSize: '0', maxSize: '0' });
    expect(filter.min_size_mb).toBe(0); expect(filter.max_size_mb).toBe(0); expect(filterChips(filter)).toContain('Size: 0–0 MB');
  });

  it('rejects negative or reversed size bounds and invalid page sizes before a request', () => {
    expect(() => filterFromDraft({ ...DEFAULT_FILE_DRAFT, minSize: '-1' })).toThrow('zero or greater');
    expect(() => filterFromDraft({ ...DEFAULT_FILE_DRAFT, minSize: '20', maxSize: '10' })).toThrow('minimum size');
    expect(() => normalizeBucketFilter({ page: 1, docs_per_page: 51 })).toThrow('between 1 and 50');
    expect(() => normalizeBucketFilter({ page: 0 })).toThrow('positive whole');
    expect(() => normalizeBucketFilter({ min_size_mb: '0' })).toThrow('finite numbers');
  });

  it('does not restore ignored country and excluded-bucket fields as functioning filters', () => {
    for (const key of ['country_code_include', 'country_code_exclude', 'excluded_buckets']) {
      expect(() => normalizeBucketFilter({ [key]: ['x'] })).toThrow('Unsupported file filter');
    }
    const parsed = readFileParams(new URLSearchParams({ filter: '{malformed' })); expect(parsed.error).toBeDefined(); expect(parsed.restored).toBe(false);
  });

  it('omits empty filter arrays and zero date bounds, while keeping extension mode only with extensions', () => {
    const filter = normalizeBucketFilter({ key_words: [' ', 'report', 'report'], stop_words: [], exclude_extensions: true, gte_cts: 0, lte_cts: 0 });
    expect(filter.key_words).toEqual(['report']); expect(filter.stop_words).toBeUndefined(); expect(filter.exclude_extensions).toBeUndefined(); expect(filter.gte_cts).toBeUndefined();
  });

  it('permits opt-in observed HTTP(S) URLs while refusing credential and scheme injection', () => {
    expect(observedFileUrl({ protocol: 'https', host: 'storage.example.com', container: 'public', key: 'reports/a b?#.csv' })).toBe('https://storage.example.com/public/reports/a%20b%3F%23.csv');
    expect(observedFileUrl({ protocol: 'javascript', host: 'example.com', key: 'x' })).toBeNull();
    expect(observedFileUrl({ protocol: 'https', host: 'attacker@example.com', key: 'x' })).toBeNull();
    expect(observedFileUrl({ protocol: 'https', host: 'example.com', key: '../private' })).toBeNull();
    expect(observedFileUrl({ host: 'example.com', key: 'x' })).toBeNull();
  });

  it('bounds long display names while preserving Unicode, suffixes and the original key', () => {
    const key = 'assets/' + 'Обзор🛰️_'.repeat(200) + 'final-preview.png';
    const shortened = middleTruncate(key);
    expect(Array.from(shortened)).toHaveLength(80);
    expect(shortened).toContain('…');
    expect(shortened.endsWith('final-preview.png')).toBe(true);
    expect(shortened).not.toContain('\uFFFD');
    const parts = nameParts(key);
    expect(parts.start + parts.end).toBe(key);
    expect(parts.end.endsWith('.png')).toBe(true);
    expect(middleTruncate('empty.txt')).toBe('empty.txt');
    expect(nameParts('empty.txt')).toEqual({ start: 'empty.txt', end: '' });
    const file = { protocol: 'https', host: 'storage.example.com', key };
    expect(decodeURIComponent(new URL(observedFileUrl(file)!).pathname)).toBe('/' + key);
    expect(file.key).toBe(key);
  });
});
