import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { ApiError, isApiError } from '../../api';
import type { ShareLinkData, ShortLinkData } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Button, Card, Field, Icon, PageHeader } from '../../components/ui';
import { SearchAccessNotice } from './SearchPage';
import { decodeSearch, encodeSearch, isShared, queryLabel, safeExternalUrl, searchPath, withoutShareToken } from './model';
import type { Dataset } from './model';
import './search.css';

export function ShareSearchPage() {
  const { api, session, toast, mode } = useApp();
  const [params] = useSearchParams(), serialized = params.toString();
  const parsed = useMemo(() => decodeSearch(new URLSearchParams(serialized)), [serialized]);
  const dataset: Dataset = params.get('dataset') === 'private' ? 'private' : 'public';
  const [days, setDays] = useState('7'), [opens, setOpens] = useState('10');
  const [limitErrors, setLimitErrors] = useState<{ days?: string; opens?: string }>({});
  const search = withoutShareToken(parsed.request), shared = isShared(parsed.request);
  const query = encodeSearch(search) + (dataset === 'private' ? '&dataset=private' : '');
  const queryValid = parsed.hasSearch && !parsed.error && !shared;
  function actionError(error: Error) { if (!(isApiError(error) && error.outcome === 'unknown')) toast(error.message, 'error'); }
  const normal = useMutation({ mutationFn: async () => {
    if (query.length > 8192) throw new Error('This query is too long for a short link.');
    const frame = await api.request<ShortLinkData>('short_link_create', { query }, { mutation: true });
    if (!safeExternalUrl(frame.data?.short_url)) throw new ApiError('unknown', 'No valid link was received from the server.', { outcome: 'unknown' });
    return frame.data!;
  }, onError: actionError });
  const limited = useMutation({ mutationFn: async () => {
    const ttl = Number(days) * 86400, maxOpens = Number(opens);
    if (!Number.isSafeInteger(ttl) || ttl < 1 || !Number.isSafeInteger(maxOpens) || maxOpens < 1) throw new Error('Check the expiry and number of uses.');
    if (query.length > 8192) throw new Error('This query is too long for a shared link.');
    const frame = await api.request<ShareLinkData>('share_link_create', { data: search, query, ttl_seconds: ttl, max_opens: maxOpens }, { mutation: true });
    if (!safeExternalUrl(frame.data?.short_url) || !frame.data?.share_token) throw new ApiError('unknown', 'The server has not returned a complete share link.', { outcome: 'unknown' });
    return frame.data!;
  }, onError: actionError });
  const unknownNormal = isApiError(normal.error) && normal.error.outcome === 'unknown', unknownLimited = isApiError(limited.error) && limited.error.outcome === 'unknown';
  const busy = normal.isPending || limited.isPending;
  const canCall = session.status === 'guest' || session.status === 'authenticated';
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); toast('Link copied.', 'success'); } catch { toast('Could not copy the link. Select the URL to copy it.', 'error'); } }
  function createLimited() {
    const ttl = Number(days) * 86400, count = Number(opens);
    const errors = { ...(!Number.isSafeInteger(ttl) || ttl < 1 ? { days: 'Enter a positive expiry of at least one second.' } : {}), ...(!Number.isSafeInteger(count) || count < 1 ? { opens: 'Enter a positive whole number.' } : {}) };
    setLimitErrors(errors);
    if (Object.keys(errors).length) { document.getElementById('share-' + ('days' in errors ? 'days' : 'opens'))?.focus(); return; }
    limited.mutate();
  }
  const backParams = new URLSearchParams(parsed.hasSearch && !parsed.error ? encodeSearch(parsed.request) : '');
  if (params.get('return_view') === 'analytics') backParams.set('view', 'analytics');
  if (dataset === 'private' && /^\/scanner(?:\?|$)/.test(params.get('scanner_back') || '')) backParams.set('scanner_back', params.get('scanner_back')!);

  return <div className="search-share-page stack">
    <PageHeader title="Share search" actions={<Link className="search-secondary-link" to={`${searchPath(dataset)}${backParams.size ? `?${backParams}` : ''}`} state={{ restoreScroll: true }}><Icon name="chevron-left" size={16} />Back to results</Link>} />
    {!canCall && <SearchAccessNotice />}
    {parsed.error && <Alert tone="error">{parsed.error}</Alert>}
    {shared && <Alert tone="info" title="This is already a limited search"><Link to={`${searchPath(dataset)}?${query}`}>Open it with your own access</Link> to create another link.</Alert>}
    {!parsed.hasSearch && <Alert tone="info">Run a search first, then share it from the results.</Alert>}
    {parsed.hasSearch && !parsed.error && <div className="search-share-query"><span>{dataset === 'private' ? 'Private search' : 'Search'}</span><strong>{queryLabel(search)}</strong><details><summary>Included conditions</summary><pre>{JSON.stringify(search, null, 2)}</pre></details></div>}
    <div className="search-share-grid">
      <Card className="search-share-card"><span className="search-share-icon"><Icon name="link" size={20} /></span><header><h2>Search link</h2><p>Share the query. Each viewer uses their own access and credits.</p></header><Button loading={normal.isPending} disabled={!queryValid || !canCall || busy || unknownNormal} onClick={() => normal.mutate()}>Create search link</Button>
        {unknownNormal && <Alert tone="warning" title="Link creation is not confirmed">{normal.error?.message} Return to the search before attempting another creation.</Alert>}
        {normal.data && <div className="search-created-link"><Field label="Search link ready" value={normal.data.short_url} readOnly /><Button variant="secondary" onClick={() => void copy(normal.data!.short_url)} aria-label="Copy link"><Icon name="copy" size={17} /></Button></div>}
      </Card>
      <Card className="search-share-card"><span className="search-share-icon"><Icon name="lock" size={20} /></span><header><h2>Limited link</h2><p>Anyone with the link can run this exact query using your access.</p></header>{dataset === 'private' && <p className="search-share-limit">Includes access to the selected private scan tasks.</p>}
        <form className="stack" noValidate onSubmit={event => { event.preventDefault(); createLimited(); }}><div className="form-grid"><Field id="share-days" label="Expires after · days" type="number" min="0" step="any" value={days} error={limitErrors.days} onChange={event => { setDays(event.target.value); setLimitErrors(current => ({ ...current, days: undefined })); }} /><Field id="share-opens" label="Maximum API uses" type="number" min="1" step="1" value={opens} error={limitErrors.opens} onChange={event => { setOpens(event.target.value); setLimitErrors(current => ({ ...current, opens: undefined })); }} /></div><p className="search-share-limit">Each search or analytics load consumes one use.</p><Button type="submit" loading={limited.isPending} disabled={!queryValid || !canCall || busy || unknownLimited}>Create limited link</Button></form>
        {unknownLimited && <Alert tone="warning" title="Link creation is not confirmed">{limited.error?.message} The server may have created the link. This action will not repeat automatically.</Alert>}
        {limited.data && <><div className="search-created-link"><Field label="Limited link ready" value={limited.data.short_url} readOnly /><Button variant="secondary" onClick={() => void copy(limited.data!.short_url)} aria-label="Copy limited link"><Icon name="copy" size={17} /></Button></div>{mode === 'demo' && <p className="search-share-limit">Available for this browser session.</p>}</>}
      </Card>
    </div>
  </div>;
}
