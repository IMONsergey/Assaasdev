import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon, PageHeader } from '../../components/ui';
import { ShareSearchPanel } from './ShareSearchDialog';
import { decodeSearch, encodeSearch, searchPath, type Dataset } from './model';
import './search.css';

/** Kept for existing direct links; the result toolbar opens the same content in a dialog. */
export function ShareSearchPage() {
  const [params] = useSearchParams(), serialized = params.toString();
  const parsed = useMemo(() => decodeSearch(new URLSearchParams(serialized)), [serialized]);
  const dataset: Dataset = params.get('dataset') === 'private' ? 'private' : 'public';
  const backParams = new URLSearchParams(parsed.hasSearch && !parsed.error ? encodeSearch(parsed.request) : '');
  if (params.get('draft') === '1') { backParams.delete('run'); backParams.set('draft', '1'); }
  if (params.get('return_view') === 'analytics') backParams.set('view', 'analytics');
  if (dataset === 'private' && /^\/scanner(?:\?|$)/.test(params.get('scanner_back') || '')) backParams.set('scanner_back', params.get('scanner_back')!);

  return <div className="search-share-page stack">
    <PageHeader title="Share search" actions={<Link className="search-secondary-link" to={`${searchPath(dataset)}${backParams.size ? `?${backParams}` : ''}`} state={{ restoreScroll: true }}><Icon name="chevron-left" size={16} />Back to results</Link>} />
    <ShareSearchPanel key={serialized} request={parsed.request} dataset={dataset} hasSearch={parsed.hasSearch} error={parsed.error} />
  </div>;
}
