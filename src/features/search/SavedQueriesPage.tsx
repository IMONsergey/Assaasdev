import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, isApiError } from '../../api';
import type { SavedQuery, SavedQueries } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Icon, PageHeader, SelectField, Skeleton } from '../../components/ui';
import { CodeCanvas } from '../../components/CodeCanvas';
import { copyText } from '../account/operation';
import { dateLabel, decodeSearch, encodeSearch, isShared, parseSavedQuery, queryLabel, searchPath, withoutShareToken } from './model';
import type { Dataset } from './model';
import './search.css';

export function SavedQueriesPage() {
  const { api, user, session, metadata, toast } = useApp();
  const [params] = useSearchParams(), navigate = useNavigate(), queryClient = useQueryClient();
  const serialized = params.toString();
  const parsed = useMemo(() => decodeSearch(new URLSearchParams(serialized)), [serialized]);
  const dataset: Dataset = params.get('dataset') === 'private' ? 'private' : 'public';
  const [restoreDataset, setRestoreDataset] = useState<Dataset>(dataset);
  useEffect(() => setRestoreDataset(dataset), [dataset]);
  const privateAccess = dataset === 'private' || user?.subscription?.type === 'Business' || metadata?.full_access === true;
  const principal = user?.user_id || user?.session_id || session.status;
  const key = ['saved-queries', principal];
  const [selected, setSelected] = useState<SavedQuery | null>(null);
  const [needle, setNeedle] = useState('');
  const list = useQuery({ queryKey: key, enabled: session.status === 'authenticated', queryFn: async ({ signal }) => {
    const response = await api.request<SavedQueries>('query_list', {}, { signal });
    if (!Array.isArray(response.data)) throw new Error('The saved-query list has an unexpected format.');
    return response.data;
  } });
  function actionError(error: Error) { if (!(isApiError(error) && error.outcome === 'unknown')) toast(error.message, 'error'); }
  const save = useMutation({ mutationFn: async () => {
    if (parsed.error) throw new Error(parsed.error);
    const response = await api.request<{ success: boolean }>('query_create', withoutShareToken(parsed.request), { mutation: true });
    if (response.data?.success !== true) throw new ApiError('unknown', 'The server has not confirmed that the query was saved.', { outcome: 'unknown' });
  }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: key }); toast('Query saved.', 'success'); }, onError: actionError });
  const remove = useMutation({ mutationFn: async (item: SavedQuery) => {
    if (!/^[a-f\d]{24}$/i.test(item.id)) throw new Error('This query could not be identified. Refresh the list.');
    const response = await api.request<{ success: boolean }>('query_delete', { id: item.id }, { mutation: true });
    if (response.data?.success !== true) throw new ApiError('unknown', 'The server has not confirmed the deletion.', { outcome: 'unknown' });
  }, onSuccess: async () => { setSelected(null); await queryClient.invalidateQueries({ queryKey: key }); toast('Saved query deleted.', 'success'); }, onError: actionError });
  const unknownSave = isApiError(save.error) && save.error.outcome === 'unknown';
  const unknownDelete = isApiError(remove.error) && remove.error.outcome === 'unknown';
  const busy = save.isPending || remove.isPending;
  const currentJson = JSON.stringify(withoutShareToken(parsed.request));
  const alreadySaved = list.data?.some(item => { try { return JSON.stringify(parseSavedQuery(item.query)) === currentJson; } catch { return false; } }) || false;
  async function reconcile() { const refreshed = await list.refetch(); if (refreshed.isSuccess) { if (selected && !refreshed.data.some(item => item.id === selected.id)) setSelected(null); save.reset(); remove.reset(); toast('Saved queries refreshed.', 'info'); } }
  function label(item: SavedQuery) { try { return queryLabel(parseSavedQuery(item.query)); } catch { return 'Saved search'; } }
  function itemDataset(item: SavedQuery): Dataset { try { return parseSavedQuery(item.query).task_ids?.length ? 'private' : restoreDataset; } catch { return restoreDataset; } }
  function openQuery(item: SavedQuery) { if (busy) return; try { const request = parseSavedQuery(item.query); navigate(`${searchPath(itemDataset(item))}?${encodeSearch(request)}`); } catch (cause) { toast(cause instanceof Error ? cause.message : 'This saved query could not be restored.', 'error'); } }
  const visibleQueries = (list.data || []).filter(item => !needle.trim() || `${label(item)} ${item.query}`.toLowerCase().includes(needle.trim().toLowerCase()));
  const backParams = new URLSearchParams(parsed.hasSearch && !parsed.error ? encodeSearch(parsed.request) : '');
  if (params.get('draft') === '1') { backParams.delete('run'); backParams.set('draft', '1'); }
  if (params.get('return_view') === 'analytics') backParams.set('view', 'analytics');
  if (dataset === 'private' && /^\/scanner(?:\?|$)/.test(params.get('scanner_back') || '')) backParams.set('scanner_back', params.get('scanner_back')!);
  const back = `${searchPath(dataset)}${backParams.size ? `?${backParams}` : ''}`;

  return <div className="search-saved-page stack">
    <PageHeader title="Saved queries" description={list.data ? `${list.data.length} of 20 saved` : undefined} actions={<Link className="search-secondary-link" to={back} state={{ restoreScroll: true }}><Icon name={parsed.hasSearch ? 'chevron-left' : 'plus'} size={16} />{parsed.hasSearch ? 'Back to results' : 'New search'}</Link>} />
    {session.status !== 'authenticated' ? <Alert tone="info" title="Saved queries are available on Plus and above"><Link to={`/auth/login?returnTo=${encodeURIComponent('/search/saved?' + serialized)}`}>Sign in</Link> to continue.</Alert> : <>
      <div className="search-saved-toolbar"><Field className="search-saved-find" label="Find a saved query" type="search" value={needle} onChange={event => setNeedle(event.target.value)} placeholder="Search by text or conditions" icon={<Icon name="search" size={18} />} /><div className="search-saved-actions">{parsed.hasSearch && <Button loading={save.isPending} disabled={!list.isSuccess || Boolean(parsed.error) || alreadySaved || (list.data?.length || 0) >= 20 || busy || unknownSave || unknownDelete || isShared(parsed.request)} onClick={() => save.mutate()}><Icon name="bookmark" size={17} />{alreadySaved ? 'Saved' : 'Save current query'}</Button>}{Boolean(list.data?.length) && <div className="search-saved-dataset"><SelectField label="Open in" value={restoreDataset} title="Queries with task IDs always open in their private scan scope." onChange={event => setRestoreDataset(event.target.value as Dataset)}><option value="public">Public internet</option><option value="private" disabled={!privateAccess}>Private scans{!privateAccess ? ' · Business' : ''}</option></SelectField></div>}<Button variant="secondary" disabled={busy || list.isFetching} aria-label="Refresh saved queries" onClick={() => void reconcile()}><Icon name="refresh" size={17} /><span>Refresh</span></Button></div></div>
      {isShared(parsed.request) && <Alert tone="info"><Link to={`${searchPath(dataset)}?${encodeSearch(withoutShareToken(parsed.request))}`}>Open this query with your own access</Link> to save it.</Alert>}
      {parsed.error && <Alert tone="error">{parsed.error}</Alert>}
      {(unknownSave || (unknownDelete && !selected)) && <Alert tone="warning" title="Action outcome is not confirmed" actions={<Button variant="secondary" onClick={() => void reconcile()}>Check current list</Button>}>{save.error?.message || remove.error?.message} Check the current list before trying again.</Alert>}
      {list.isPending && <Skeleton rows={5} label="Loading saved queries" />}
      {list.error && <Alert tone="error" title="Saved queries could not be loaded" actions={<Button variant="secondary" onClick={() => void list.refetch()}>Try again</Button>}>{list.error.message}</Alert>}
      {list.data?.length === 0 && <EmptyState icon={<Icon name="bookmark" size={28} />} title="Your searches, ready to return to" description={parsed.hasSearch ? 'Save this query to find it here next time.' : 'Run a search and save it from the results.'} actions={!parsed.hasSearch ? <Link className="search-secondary-link" to={searchPath(dataset)}>Start a search</Link> : undefined} />}
      {Boolean(list.data?.length) && <div className="search-saved-list">{visibleQueries.map(item => <article className="search-saved-query" key={item.id} onClick={event => { if (!(event.target as HTMLElement).closest('button,a,details,input,select') && !window.getSelection()?.toString()) openQuery(item); }}><div><span className="search-saved-symbol"><Icon name="bookmark" size={21} /></span><h2>{label(item)}</h2><p className="muted"><Badge>{itemDataset(item) === 'private' ? 'Private' : 'Public'}</Badge> · {dateLabel(item.created_at)}</p><details><summary>Query details</summary><CodeCanvas content={item.query} language="json" title="Saved request" onCopy={text => copyText(text, toast)} /></details></div><div className="cluster"><Button variant="secondary" size="sm" disabled={busy} title="Retrieves current data using your access and credits" onClick={() => openQuery(item)}>Open query<Icon name="arrow-up-right" size={15} /></Button><Button variant="ghost" size="sm" className="icon-button" aria-label={`Delete ${label(item)}`} disabled={busy || unknownDelete || unknownSave} onClick={() => { remove.reset(); setSelected(item); }}><Icon name="trash" size={16} /></Button></div></article>)}</div>}
      {Boolean(list.data?.length) && visibleQueries.length === 0 && <EmptyState title="No saved queries match" description="Try a different word or clear the search." actions={<Button variant="secondary" onClick={() => setNeedle('')}>Clear search</Button>} />}
    </>}
    <Dialog open={selected !== null} onClose={() => { if (!remove.isPending) setSelected(null); }} title="Delete saved query?" footer={<><Button variant="secondary" disabled={remove.isPending} onClick={() => setSelected(null)}>Cancel</Button><Button variant="danger" loading={remove.isPending} disabled={unknownDelete} onClick={() => { if (selected) remove.mutate(selected); }}>Delete query</Button></>}>
      {selected && <div className="search-confirmed-record"><strong>{label(selected)}</strong><small className="muted">Saved {dateLabel(selected.created_at)}</small></div>}
      {unknownDelete && <Alert tone="warning" title="Deletion outcome is not confirmed" actions={<Button variant="secondary" onClick={() => void reconcile()}>Check current list</Button>}>{remove.error?.message}</Alert>}
    </Dialog>
  </div>;
}
