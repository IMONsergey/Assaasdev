import { useId, useState } from 'react';
import { Link } from 'react-router';
import { skipToken, useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, isApiError, type SearchRequest, type ShareLinkData, type ShortLinkData } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Dialog, Field, Icon, TabPanel, Tabs } from '../../components/ui';
import { CodeCanvas } from '../../components/CodeCanvas';
import { copyText } from '../account/operation';
import { encodeSearch, isShared, queryLabel, safeExternalUrl, withoutShareToken, type Dataset } from './model';

interface ShareProps { request: SearchRequest; dataset: Dataset; hasSearch?: boolean; error?: string; onClose?: () => void }
interface ShareChoices { kind: 'normal' | 'limited'; days: string; opens: string }

function useShareMutation<T>(mutationKey: readonly unknown[], mutationFn: () => Promise<T>) {
  const client = useQueryClient();
  // Keep confirmed and uncertain outcomes for this signed-in session. AppProvider
  // clears the cache when the principal changes; reopening never retries a write.
  const mutation = useMutation({ mutationKey, mutationFn, gcTime: Infinity });
  const attempts = useMutationState({ filters: { mutationKey, exact: true } });
  const latest = attempts.at(-1);
  return {
    data: latest?.data as T | undefined,
    error: latest?.error ?? null,
    isPending: latest?.status === 'pending',
    mutate() {
      const current = client.getMutationCache().findAll({ mutationKey, exact: true }).at(-1)?.state;
      if (current && (current.status === 'pending' || current.status === 'success' || (isApiError(current.error) && current.error.outcome === 'unknown'))) return;
      mutation.mutate();
    },
  };
}

function ShareSearchWorkspace({ request, dataset, hasSearch = true, error, onClose }: ShareProps) {
  const { api, session, user, toast, mode } = useApp();
  const client = useQueryClient();
  const controlId = useId();
  const [limitErrors, setLimitErrors] = useState<{ days?: string; opens?: string }>({});
  const [copied, setCopied] = useState('');
  const search = withoutShareToken(request), shared = isShared(request);
  const query = encodeSearch(search) + (dataset === 'private' ? '&dataset=private' : '');
  const principal = user?.user_id || user?.session_id || session.status;
  const baseKey = ['search-share', principal, dataset, JSON.stringify(search), query];
  const choicesKey = [...baseKey, 'choices'];
  const choices = useQuery<ShareChoices>({ queryKey: choicesKey, queryFn: skipToken, gcTime: Infinity, initialData: { kind: 'normal', days: '7', opens: '10' } }).data!;
  const { kind, days, opens } = choices;
  function updateChoices(next: Partial<ShareChoices>) { client.setQueryData<ShareChoices>(choicesKey, { ...choices, ...next }); setCopied(''); }
  const canCall = session.status === 'guest' || session.status === 'authenticated';
  const queryValid = hasSearch && !error && !shared;
  const normal = useShareMutation([...baseKey, 'normal'], async () => {
    if (!queryValid || !canCall) throw new Error('Run a search with your own access before creating a link.');
    if (query.length > 8192) throw new Error('This query is too long for a short link. Reduce the conditions first.');
    const frame = await api.request<ShortLinkData>('short_link_create', { query }, { mutation: true });
    if (!safeExternalUrl(frame.data?.short_url)) throw new ApiError('unknown', 'No valid link was received from the server.', { outcome: 'unknown' });
    return frame.data!;
  });
  const limited = useShareMutation([...baseKey, 'limited', Number(days) * 86400, Number(opens)], async () => {
    if (!queryValid || !canCall) throw new Error('Run a search with your own access before creating a link.');
    const ttl = Number(days) * 86400, maxOpens = Number(opens);
    if (!Number.isSafeInteger(ttl) || ttl < 1 || !Number.isSafeInteger(maxOpens) || maxOpens < 1) throw new Error('Check the expiry and number of uses.');
    if (query.length > 8192) throw new Error('This query is too long for a shared link. Reduce the conditions first.');
    const frame = await api.request<ShareLinkData>('share_link_create', { data: search, query, ttl_seconds: ttl, max_opens: maxOpens }, { mutation: true });
    if (!safeExternalUrl(frame.data?.short_url) || !frame.data?.share_token) throw new ApiError('unknown', 'The server has not returned a complete share link.', { outcome: 'unknown' });
    return frame.data!;
  });
  const busy = normal.isPending || limited.isPending;
  const active = kind === 'limited' ? limited : normal;
  const uncertain = isApiError(active.error) && active.error.outcome === 'unknown';
  const link = active.data?.short_url;
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(value); toast('Link copied.', 'success'); }
    catch { toast('Could not copy the link. Select the URL to copy it.', 'error'); }
  }
  function createLimited() {
    const ttl = Number(days) * 86400, count = Number(opens);
    const errors = { ...(!Number.isSafeInteger(ttl) || ttl < 1 ? { days: 'Enter an expiry of at least one second.' } : {}), ...(!Number.isSafeInteger(count) || count < 1 ? { opens: 'Enter a positive whole number.' } : {}) };
    setLimitErrors(errors);
    if (Object.keys(errors).length) { document.getElementById(`${controlId}-${'days' in errors ? 'days' : 'opens'}`)?.focus(); return; }
    limited.mutate();
  }
  const action = <>{onClose && <Button variant="secondary" disabled={busy} onClick={onClose}>Close</Button>}{link ? <Button onClick={() => void copy(link)}><Icon name={copied === link ? 'check' : 'copy'} size={17} />{copied === link ? 'Copied' : 'Copy link'}</Button> : <Button loading={busy} disabled={!queryValid || !canCall || uncertain} onClick={() => kind === 'limited' ? createLimited() : normal.mutate()}>{kind === 'limited' ? 'Create limited link' : 'Create search link'}<Icon name="link" size={17} /></Button>}</>;
  const content = <div className="search-share-content stack">
    {!canCall && <Alert tone="info" title="Sign in to share a search"><Link to="/auth/login">Continue to sign in</Link></Alert>}
    {error && <Alert tone="error">{error}</Alert>}
    {shared && <Alert tone="info">This is already a limited-access search. Start your own search before creating another link.</Alert>}
    {!hasSearch && <Alert tone="info">Run a search first, then share it from the results.</Alert>}
    {hasSearch && !error && <div className="search-share-query"><Badge>{dataset === 'private' ? 'Private scans' : 'Public internet'}</Badge><strong>{queryLabel(search)}</strong><details className="search-action-conditions"><summary>Included conditions<Icon name="chevron-down" size={16} /></summary><CodeCanvas content={JSON.stringify(search, null, 2)} language="json" title="Shared request" onCopy={text => copyText(text, toast)} /></details></div>}
    <div className="search-share-grid">
      <Tabs idPrefix={controlId} ariaLabel="Link access" items={[{ id: 'normal', label: 'Search link', icon: 'link' }, { id: 'limited', label: 'Limited access', icon: 'lock' }]} value={kind} onChange={next => { if (!busy) updateChoices({ kind: next as ShareChoices['kind'] }); }} />
      <TabPanel idPrefix={controlId} value="normal" hidden={kind !== 'normal'}><div className="search-share-description"><h3>Share the query</h3><p>Each viewer uses their own account access and credits. Your account permissions stay private.</p></div></TabPanel>
      <TabPanel idPrefix={controlId} value="limited" hidden={kind !== 'limited'}><div className="search-share-description"><h3>Grant access to this search</h3><p>Anyone with this link can run the exact query using your access, within the limits below.</p></div>{dataset === 'private' && <Alert tone="info">This also grants access to the selected private scan results.</Alert>}<form className="stack search-share-limits" noValidate onSubmit={event => { event.preventDefault(); if (!busy && !link && queryValid && canCall && !uncertain) createLimited(); }}><div className="form-grid"><Field id={`${controlId}-days`} label="Expires after · days" type="number" min="0" step="any" value={days} disabled={busy || Boolean(limited.data) || uncertain} error={limitErrors.days} onChange={event => { updateChoices({ days: event.target.value }); setLimitErrors(current => ({ ...current, days: undefined })); }} /><Field id={`${controlId}-opens`} label="Maximum API uses" type="number" min="1" step="1" value={opens} disabled={busy || Boolean(limited.data) || uncertain} error={limitErrors.opens} onChange={event => { updateChoices({ opens: event.target.value }); setLimitErrors(current => ({ ...current, opens: undefined })); }} /></div><p className="search-share-limit">Each search or analytics load uses one allowance.</p></form></TabPanel>
      {active.error && <Alert tone={uncertain ? 'warning' : 'error'} title={uncertain ? 'Link creation is not confirmed' : 'The link could not be created'}>{active.error.message}{uncertain && ' The server may have created a link. This action will not repeat automatically.'}</Alert>}
      {link && <div className="search-created-link"><Field label={kind === 'limited' ? 'Limited link ready' : 'Search link ready'} value={link} readOnly autoComplete="off" onFocus={event => event.target.select()} /><Button variant="secondary" onClick={() => void copy(link)} aria-label={kind === 'limited' ? 'Copy limited link' : 'Copy link'}><Icon name={copied === link ? 'check' : 'copy'} size={17} /></Button></div>}
      {link && kind === 'limited' && mode === 'demo' && <p className="search-share-limit">Available for this browser session.</p>}
    </div>
  </div>;
  return onClose ? <Dialog open onClose={() => { if (!busy) onClose(); }} title="Share search" size="md" className="search-action-dialog search-share-dialog" footer={action}>{content}</Dialog> : <div className="search-share-workspace">{content}<div className="search-share-page-actions">{action}</div></div>;
}

export function ShareSearchDialog(props: ShareProps & { onClose: () => void }) { return <ShareSearchWorkspace {...props} />; }
export function ShareSearchPanel(props: Omit<ShareProps, 'onClose'>) { return <ShareSearchWorkspace {...props} />; }
