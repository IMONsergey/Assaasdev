import type { BucketAnalytics, BucketFile, BucketFilter, BucketResults } from '../../api';
import { ApiError } from '../../api/errors';

export type FilesView = 'files' | 'hosts';
export interface FileDraft {
  host: string; keywords: string; stopWords: string; extensions: string; excludeExtensions: boolean;
  products: string; alphabets: string; minSize: string; maxSize: string;
  discoveredFrom: string; discoveredTo: string; updatedFrom: string; updatedTo: string;
  sort: string; pageSize: string;
}
export const DEFAULT_FILE_DRAFT: FileDraft = {
  host: '', keywords: '', stopWords: '', extensions: '', excludeExtensions: false,
  products: '', alphabets: '', minSize: '', maxSize: '', discoveredFrom: '', discoveredTo: '',
  updatedFrom: '', updatedTo: '', sort: 'uts:desc', pageSize: '20',
};
const listFields = ['key_words', 'stop_words', 'extensions', 'alphabets', 'product_names'] as const;
const numberFields = ['min_size_mb', 'max_size_mb', 'gte_uts', 'lte_uts', 'gte_cts', 'lte_cts'] as const;
const allowed = new Set(['page', 'docs_per_page', 'host', 'exclude_extensions', 'sort_field', 'sort_direction', ...listFields, ...numberFields]);
export const FILE_PAGE_CAPS: Record<string, number> = { Free: 2, Guest: 2, Plus: 25, Expert: 150, Business: 300 };

/** Validate received metadata before rendering string/list operations; keep the source unchanged. */
export function checkedBucketResult(value: unknown, view: FilesView): BucketResults | BucketAnalytics {
  if (!value || typeof value !== 'object' || !('result' in value) || !Array.isArray(value.result) || !('result_count' in value) || typeof value.result_count !== 'number' || !Number.isSafeInteger(value.result_count) || value.result_count < 0) throw new ApiError('transport', 'The server returned an unexpected bucket result.', { outcome: 'unknown' });
  const optionalStrings = view === 'files' ? ['host', 'container', 'protocol', 'key', 'extension'] : ['container'];
  const invalid = value.result.some(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return true;
    if (optionalStrings.some(key => row[key] != null && typeof row[key] !== 'string')) return true;
    if (view === 'hosts') return typeof row.host !== 'string' || !row.host.trim() || !Number.isSafeInteger(row.file_count) || row.file_count < 0;
    if (['cts', 'uts', 'size_mb'].some(key => row[key] != null && (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || row[key] < 0))) return true;
    return ['alphabets', 'alias_hosts'].some(key => row[key] != null && (!Array.isArray(row[key]) || row[key].some((item: unknown) => typeof item !== 'string')));
  });
  if (invalid) throw new ApiError('transport', 'Some returned records contain invalid file or bucket metadata.', { outcome: 'unknown' });
  return value as BucketResults | BucketAnalytics;
}

export function list(value: string): string[] {
  return [...new Set(value.split(/[,\n]/).map(item => item.trim()).filter(Boolean))];
}
/** All input times are explicitly UTC, independent of the viewer's timezone. */
export function utcSeconds(value: string): number | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) throw new Error('Enter a complete date and time in UTC.');
  const normalized = value.length === 16 ? `${value}:00` : value;
  const time = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== normalized || time <= 0) throw new Error('Enter a valid UTC date after 1 January 1970.');
  return time / 1000;
}
export function utcInput(value?: number): string { return value && Number.isFinite(value) ? new Date(value * 1000).toISOString().slice(0, 19) : ''; }

export function normalizeBucketFilter(value: unknown): BucketFilter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The file filters must be an object.');
  const data = value as Record<string, unknown>, result: BucketFilter = {};
  for (const key of Object.keys(data)) if (!allowed.has(key)) throw new Error(`Unsupported file filter: ${key}.`);
  if (data.host !== undefined) {
    if (typeof data.host !== 'string' || data.host.length > 4096) throw new Error('Enter a bucket host with at most 4,096 characters.');
    if (data.host.trim()) result.host = data.host.trim();
  }
  for (const key of listFields) {
    const input = data[key]; if (input === undefined) continue;
    if (!Array.isArray(input) || input.length > 100 || input.some(item => typeof item !== 'string' || item.length > 4096)) throw new Error(`Check the ${key.replaceAll('_', ' ')} list.`);
    const values = [...new Set((input as string[]).map(item => item.trim()).filter(Boolean))];
    if (values.length) result[key] = values;
  }
  if (data.exclude_extensions !== undefined && typeof data.exclude_extensions !== 'boolean') throw new Error('The extension mode must be include or exclude.');
  if (result.extensions?.length) result.exclude_extensions = data.exclude_extensions === true;
  for (const key of numberFields) {
    const input = data[key]; if (input === undefined) continue;
    if (typeof input !== 'number' || !Number.isFinite(input) || input < 0 || (key !== 'min_size_mb' && key !== 'max_size_mb' && (!Number.isSafeInteger(input) || input > 253402300799))) throw new Error('Size and date bounds must be nonnegative, finite numbers within the supported date range.');
    if (key === 'min_size_mb' || key === 'max_size_mb' || input > 0) result[key] = input;
  }
  for (const [lower, upper, label] of [['min_size_mb', 'max_size_mb', 'size'], ['gte_cts', 'lte_cts', 'discovery date'], ['gte_uts', 'lte_uts', 'updated date']] as const) {
    if (result[lower] !== undefined && result[upper] !== undefined && result[lower]! > result[upper]!) throw new Error(`The minimum ${label} must not exceed the maximum.`);
  }
  if (data.sort_field !== undefined && !['cts', 'uts', 'size_mb'].includes(String(data.sort_field))) throw new Error('Sort by discovery date, updated date or file size.');
  if (data.sort_direction !== undefined && !['asc', 'desc'].includes(String(data.sort_direction))) throw new Error('Choose ascending or descending sort.');
  if (data.sort_field) { result.sort_field = data.sort_field as BucketFilter['sort_field']; result.sort_direction = (data.sort_direction ?? 'desc') as BucketFilter['sort_direction']; }
  const page = data.page ?? 1, size = data.docs_per_page ?? 20;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1) throw new Error('The page must be a positive whole number.');
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > 50) throw new Error('Rows per page must be between 1 and 50.');
  result.page = page; result.docs_per_page = size;
  return result;
}
export function filterFromDraft(draft: FileDraft): BucketFilter {
  const size = (value: string, label: string) => {
    if (value.trim() === '') return undefined;
    const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be zero or greater.`); return number;
  };
  const [sort_field, sort_direction] = draft.sort.split(':');
  return normalizeBucketFilter({
    host: draft.host, key_words: list(draft.keywords), stop_words: list(draft.stopWords),
    extensions: list(draft.extensions).map(extension => extension.replace(/^\./, '')), exclude_extensions: draft.excludeExtensions,
    product_names: list(draft.products), alphabets: list(draft.alphabets),
    min_size_mb: size(draft.minSize, 'Minimum file size'), max_size_mb: size(draft.maxSize, 'Maximum file size'),
    gte_cts: utcSeconds(draft.discoveredFrom), lte_cts: utcSeconds(draft.discoveredTo),
    gte_uts: utcSeconds(draft.updatedFrom), lte_uts: utcSeconds(draft.updatedTo),
    sort_field, sort_direction, page: 1, docs_per_page: Number(draft.pageSize),
  });
}
export function draftFromFilter(filter: BucketFilter): FileDraft {
  return { host: filter.host ?? '', keywords: filter.key_words?.join(', ') ?? '', stopWords: filter.stop_words?.join(', ') ?? '', extensions: filter.extensions?.join(', ') ?? '', excludeExtensions: filter.exclude_extensions === true, products: filter.product_names?.join(', ') ?? '', alphabets: filter.alphabets?.join(', ') ?? '', minSize: filter.min_size_mb === undefined ? '' : String(filter.min_size_mb), maxSize: filter.max_size_mb === undefined ? '' : String(filter.max_size_mb), discoveredFrom: utcInput(filter.gte_cts), discoveredTo: utcInput(filter.lte_cts), updatedFrom: utcInput(filter.gte_uts), updatedTo: utcInput(filter.lte_uts), sort: `${filter.sort_field ?? 'uts'}:${filter.sort_direction ?? 'desc'}`, pageSize: String(filter.docs_per_page ?? 20) };
}
export function readFileParams(params: URLSearchParams): { filter: BucketFilter; view: FilesView; restored: boolean; error?: string } {
  const raw = params.get('filter'), view = params.get('view') === 'hosts' ? 'hosts' : 'files';
  if (!raw) return { filter: filterFromDraft(DEFAULT_FILE_DRAFT), view, restored: false };
  try { if (raw.length > 16000) throw new Error('This file search link is too long.'); return { filter: normalizeBucketFilter(JSON.parse(raw)), view, restored: true }; }
  catch (error) { return { filter: filterFromDraft(DEFAULT_FILE_DRAFT), view, restored: false, error: error instanceof Error ? error.message : 'This file search link is invalid.' }; }
}
export function fileParams(filter: BucketFilter, view: FilesView): URLSearchParams { return new URLSearchParams({ filter: JSON.stringify(normalizeBucketFilter(filter)), view }); }
export function fileSignInHref(draft: FileDraft, view: FilesView, fallback: BucketFilter): string {
  let filter = fallback;
  try { filter = filterFromDraft(draft); } catch { /* Preserve the last valid filters when the draft is incomplete. */ }
  return `/auth/login?returnTo=${encodeURIComponent(`/files?${fileParams(filter, view)}`)}`;
}
export function bucketIdentity(host?: string, container?: string): string { return [host, container].filter(Boolean).join('/'); }
export function fileName(file: BucketFile): string { return file.key?.split('/').filter(Boolean).at(-1) || 'Name not provided'; }
/** Presentation only. The original key remains intact for copying, URLs and requests. */
export function middleTruncate(value: string, maxLength = 80): string {
  const chars = Array.from(value);
  if (chars.length <= maxLength) return value;
  const tailLength = Math.min(24, Math.floor((maxLength - 1) / 3));
  return `${chars.slice(0, maxLength - tailLength - 1).join('')}…${chars.slice(-tailLength).join('')}`;
}
/** Keep the suffix visible while CSS ellipsizes the start at any available width. */
export function nameParts(value: string): { start: string; end: string } {
  const chars = Array.from(value);
  if (chars.length <= 24) return { start: value, end: '' };
  return { start: chars.slice(0, -18).join(''), end: chars.slice(-18).join('') };
}
export function fileSize(size?: number): string {
  if (size === undefined || !Number.isFinite(size)) return 'Not observed';
  if (size === 0) return '0 MB';
  if (size < 0.001) return '<0.001 MB';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(size)} MB`;
}
/** Observed URLs are opt-in navigation; credentials, injected schemes and dot paths are refused. */
export function observedFileUrl(file: BucketFile): string | null {
  if (!file.host || !file.protocol || !['http', 'https'].includes(file.protocol) || /[\s/@?#\\]/.test(file.host)) return null;
  const segments = [file.container, file.key].filter((part): part is string => typeof part === 'string' && !!part).flatMap(part => part.split('/'));
  if (segments.some(segment => segment === '..' || segment === '.')) return null;
  try { const url = new URL(`${file.protocol}://${file.host}`); if (url.username || url.password) return null; url.pathname = '/' + segments.map(encodeURIComponent).join('/'); return url.toString(); } catch { return null; }
}
export function filterChips(filter: BucketFilter): string[] {
  const result: string[] = [];
  if (filter.host) result.push(`Host: ${filter.host}`);
  if (filter.key_words?.length) result.push(`Contains: ${filter.key_words.join(', ')}`);
  if (filter.stop_words?.length) result.push(`Excludes: ${filter.stop_words.join(', ')}`);
  if (filter.extensions?.length) result.push(`${filter.exclude_extensions ? 'Exclude' : 'Include'}: ${filter.extensions.join(', ')}`);
  if (filter.product_names?.length) result.push(`Products: ${filter.product_names.join(', ')}`);
  if (filter.alphabets?.length) result.push(`Alphabets: ${filter.alphabets.join(', ')}`);
  if (filter.min_size_mb !== undefined || filter.max_size_mb !== undefined) result.push(`Size: ${filter.min_size_mb ?? 0}–${filter.max_size_mb ?? 'any'} MB`);
  if (filter.gte_cts || filter.lte_cts) result.push('Discovery date range · UTC');
  if (filter.gte_uts || filter.lte_uts) result.push('Updated date range · UTC');
  return result;
}
