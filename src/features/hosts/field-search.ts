import type { SearchRequest } from '../../api';
import { decodeSearch, encodeSearch, searchPath, type Dataset } from '../search/model';

/** A field pivot creates a new draft and never inherits a host-bound share token. */
export function fieldSearchHref(field: string, value: unknown, pathname: string, query: string): string | null {
  if (!field.trim() || typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  if (!text.trim() || text.length > 4096 || typeof value === 'number' && !Number.isFinite(value)) return null;
  const dataset: Dataset = pathname.startsWith('/private/') ? 'private' : 'public';
  const original = new URLSearchParams(query), parsed = decodeSearch(original);
  const request: SearchRequest = {
    simple_search_filters: [{ field, value: field === 'title' ? JSON.stringify(text) : text }],
    page: 1, docs_per_page: 20, sort_field: 'uts', sort_direction: 'desc',
    ...(dataset === 'private' && !parsed.error && parsed.request.task_ids?.length ? { task_ids: parsed.request.task_ids } : {}),
  };
  const params = new URLSearchParams(encodeSearch(request));
  params.delete('run'); params.set('draft', '1');
  const scannerBack = original.get('scanner_back');
  if (dataset === 'private' && scannerBack && /^\/scanner(?:[/?#]|$)/.test(scannerBack) && !/[\\\u0000-\u001f]/.test(scannerBack)) params.set('scanner_back', scannerBack);
  return `${searchPath(dataset)}?${params}`;
}
