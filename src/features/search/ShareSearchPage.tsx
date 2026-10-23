import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { ApiError, isApiError } from '../../api';
import type { ShareLinkData, ShortLinkData } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Button, Card, Field, PageHeader } from '../../components/ui';
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
  const search = withoutShareToken(parsed.request), shared = isShared(parsed.request);
  const query = encodeSearch(search) + (dataset === 'private' ? '&dataset=private' : '');
  const queryValid = parsed.hasSearch && !parsed.error && !shared;
  const normal = useMutation({ mutationFn: async () => {
    if (query.length > 8192) throw new Error('This query is too long for a short link (8,192 characters).');
    const frame = await api.request<ShortLinkData>('short_link_create', { query }, { mutation: true });
    if (!safeExternalUrl(frame.data?.short_url)) throw new ApiError('unknown', 'No valid link was received from the server.', { outcome: 'unknown' });
    return frame.data!;
  } });
  const limited = useMutation({ mutationFn: async () => {
    const ttl = Number(days) * 86400, maxOpens = Number(opens);
    if (!Number.isSafeInteger(ttl) || ttl < 1 || !Number.isSafeInteger(maxOpens) || maxOpens < 1) throw new Error('Enter a positive expiry and a positive whole number of opens.');
    if (query.length > 8192) throw new Error('This query is too long for a shared link.');
    const frame = await api.request<ShareLinkData>('share_link_create', { data: search, query, ttl_seconds: ttl, max_opens: maxOpens }, { mutation: true });
    if (!safeExternalUrl(frame.data?.short_url) || !frame.data?.share_token) throw new ApiError('unknown', 'The server has not returned a complete share link.', { outcome: 'unknown' });
    return frame.data!;
  } });
  const unknownNormal = isApiError(normal.error) && normal.error.outcome === 'unknown', unknownLimited = isApiError(limited.error) && limited.error.outcome === 'unknown';
  const busy = normal.isPending || limited.isPending;
  const canCall = session.status === 'guest' || session.status === 'authenticated';
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); toast('Link copied.', 'success'); } catch { toast('The link could not be copied. Select the URL and copy it manually.', 'error'); } }
  return <div className="search-share-page stack"><PageHeader title="Share search" description="Share the current query and its conditions." actions={<Link className="search-secondary-link" to={`${searchPath(dataset)}${parsed.hasSearch && !parsed.error ? '?' + encodeSearch(parsed.request) : ''}`}>Back to results</Link>} />{mode === "demo" && <Alert tone="info" title="Demo links">Limited links use preview data and work within this open session. Reloading the page clears them.</Alert>}{!canCall && <SearchAccessNotice />}{parsed.error && <Alert tone="error">{parsed.error}</Alert>}{shared && <Alert tone="info" title="This link already represents a limited search">To create a new link, first <Link to={`${searchPath(dataset)}?${query}`}>open the search with your own access</Link>.</Alert>}{!parsed.hasSearch && <Alert tone="info">Run a search first, then open Share from its results.</Alert>}<Card className="search-share-card"><h2>Search link</h2><p>Restores this exact query. Each viewer uses their own access and credits.</p><Field label="Query" value={queryLabel(search)} readOnly className="mono" /><details><summary>Included conditions</summary><pre>{JSON.stringify(search, null, 2)}</pre></details><Button loading={normal.isPending} disabled={!queryValid || !canCall || busy || unknownNormal} onClick={() => normal.mutate()}>Create search link</Button>{normal.error && <Alert tone={unknownNormal ? 'warning' : 'error'} title={unknownNormal ? 'Link creation is not confirmed' : 'Link could not be created'}>{normal.error.message}{unknownNormal && ' No usable URL was received. Return to the search before attempting another creation.'}</Alert>}{normal.data && <div className="search-created-link"><Field label="Search link ready" value={normal.data.short_url} readOnly /><Button variant="secondary" onClick={() => void copy(normal.data!.short_url)}>Copy link</Button></div>}</Card><Card className="search-share-card"><h2>Limited link</h2><Alert tone="warning">Anyone with this link can run this exact search using your access. Each API call with the token consumes a use. Changing the search requires a new link.</Alert>{dataset === 'private' && <p className="muted">This includes private task scope. Review the task IDs before sharing access.</p>}<div className="form-grid"><Field label="Expires after · days" type="number" min="0" step="any" value={days} onChange={event => setDays(event.target.value)} /><Field label="Maximum API uses" type="number" min="1" step="1" value={opens} onChange={event => setOpens(event.target.value)} /></div><p className="muted">Defaults: 7 days · 10 uses. Analytics is loaded only when a viewer explicitly requests it.</p><Button loading={limited.isPending} disabled={!queryValid || !canCall || busy || unknownLimited} onClick={() => limited.mutate()}>Create limited link</Button>{limited.error && <Alert tone={unknownLimited ? 'warning' : 'error'} title={unknownLimited ? 'Link creation is not confirmed' : 'Limited link could not be created'}>{limited.error.message}{unknownLimited && ' The server may have created a token, but no usable link was received. This action is not automatically repeated.'}</Alert>}{limited.data && <div className="search-created-link"><Field label="Limited link ready" value={limited.data.short_url} readOnly /><Button variant="secondary" onClick={() => void copy(limited.data!.short_url)}>Copy limited link</Button></div>}</Card></div>;
}
