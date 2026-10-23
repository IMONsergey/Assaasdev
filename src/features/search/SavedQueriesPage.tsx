import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, isApiError } from '../../api';
import type { SavedQuery, SavedQueries } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Button, Dialog, EmptyState, PageHeader, SelectField, Spinner } from '../../components/ui';
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
  const [restoreError, setRestoreError] = useState('');
  const list = useQuery({ queryKey: key, enabled: session.status === 'authenticated', queryFn: async ({ signal }) => {
    const response = await api.request<SavedQueries>('query_list', {}, { signal });
    if (!Array.isArray(response.data)) throw new Error('The saved-query list has an unexpected format.');
    return response.data;
  } });
  const save = useMutation({ mutationFn: async () => {
    if (parsed.error) throw new Error(parsed.error);
    const response = await api.request<{ success: boolean }>('query_create', withoutShareToken(parsed.request), { mutation: true });
    if (response.data?.success !== true) throw new ApiError('unknown', 'The server has not confirmed that the query was saved.', { outcome: 'unknown' });
  }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: key }); toast('Query saved.', 'success'); } });
  const remove = useMutation({ mutationFn: async (item: SavedQuery) => {
    if (!/^[a-f\d]{24}$/i.test(item.id)) throw new Error('This record has no valid server ID. Refresh the saved-query list.');
    const response = await api.request<{ success: boolean }>('query_delete', { id: item.id }, { mutation: true });
    if (response.data?.success !== true) throw new ApiError('unknown', 'The server has not confirmed the deletion.', { outcome: 'unknown' });
  }, onSuccess: async () => { setSelected(null); await queryClient.invalidateQueries({ queryKey: key }); toast('Saved query deleted.', 'success'); } });
  const unknownSave = isApiError(save.error) && save.error.outcome === 'unknown';
  const unknownDelete = isApiError(remove.error) && remove.error.outcome === 'unknown';
  const busy = save.isPending || remove.isPending;
  const currentJson = JSON.stringify(withoutShareToken(parsed.request));
  const alreadySaved = list.data?.some(item => { try { return JSON.stringify(parseSavedQuery(item.query)) === currentJson; } catch { return false; } }) || false;
  async function reconcile() { const refreshed = await list.refetch(); if (refreshed.isSuccess) { if (selected && !refreshed.data.some(item => item.id === selected.id)) setSelected(null); save.reset(); remove.reset(); toast('List refreshed. Review the current records before repeating an action.', 'info'); } }
  function label(item: SavedQuery) { try { return queryLabel(parseSavedQuery(item.query)); } catch { return 'Saved search · review JSON'; } }
  function itemDataset(item: SavedQuery): Dataset { try { return parseSavedQuery(item.query).task_ids?.length ? 'private' : restoreDataset; } catch { return restoreDataset; } }
  const back = `${searchPath(dataset)}${parsed.hasSearch && !parsed.error ? `?${encodeSearch(parsed.request)}` : ''}`;
  return <div className="search-saved-page stack"><PageHeader title="Saved queries" description={list.data ? `${list.data.length} of 20 saved · Keep the query, conditions and selected type together.` : 'Keep your searches and return to their exact conditions.'} actions={<Link className="search-secondary-link" to={back} state={{ restoreScroll: true }}>Back to results</Link>} />{session.status !== 'authenticated' ? <Alert tone="info" title="Saved queries are available on Plus and above"><Link to={`/auth/login?returnTo=${encodeURIComponent('/search/saved?' + serialized)}`}>Sign in</Link> to see your saved queries.</Alert> : <><div className="cluster"><Button loading={save.isPending} disabled={!list.isSuccess || !parsed.hasSearch || Boolean(parsed.error) || alreadySaved || (list.data?.length || 0) >= 20 || busy || unknownSave || unknownDelete || isShared(parsed.request)} onClick={() => save.mutate()}>{alreadySaved ? 'Already saved' : 'Save current query'}</Button><Button variant="ghost" disabled={busy || list.isFetching} onClick={() => void reconcile()}>Refresh list</Button></div>{isShared(parsed.request) && <Alert tone="info">This is a limited shared search. <Link to={`${searchPath(dataset)}?${encodeSearch(withoutShareToken(parsed.request))}`}>Open it with your own access</Link> before saving it.</Alert>}{!parsed.hasSearch && <p className="muted">Open a search first to save its full query and conditions.</p>}{parsed.error && <Alert tone="error">{parsed.error}</Alert>}{(save.error || (remove.error && !selected)) && <Alert tone={unknownSave || unknownDelete ? 'warning' : 'error'} title={unknownSave || unknownDelete ? 'Action outcome is not confirmed' : 'The action could not be completed'} actions={(unknownSave || unknownDelete) ? <Button variant="secondary" onClick={() => void reconcile()}>Check current list</Button> : undefined}>{save.error?.message || remove.error?.message}{(unknownSave || unknownDelete) && ' Refresh the list before trying again.'}</Alert>}{restoreError && <Alert tone="error" title="This saved query could not be restored">{restoreError}</Alert>}{list.isPending && <Spinner label="Loading saved queries" />}{list.error && <Alert tone="error" title="Saved queries could not be loaded" actions={<Button variant="secondary" onClick={() => void list.refetch()}>Try again</Button>}>{list.error.message} <Link to="/billing">Compare plans</Link></Alert>}{list.data?.length === 0 && <EmptyState title="No saved queries yet" description="Save the current search to keep its query and conditions." />}{Boolean(list.data?.length) && <div className="search-saved-dataset"><SelectField label="Dataset for queries without task IDs" value={restoreDataset} onChange={event => setRestoreDataset(event.target.value as Dataset)}><option value="public">Public internet data</option><option value="private" disabled={!privateAccess}>Private scan results{!privateAccess ? ' · Business or full access' : ''}</option></SelectField><p className="muted">Choose where to run saved conditions. Queries with task IDs always keep their private task scope. No search runs until you select Open query.</p></div>}{list.data?.map(item => <article className="search-saved-query" key={item.id}><div><h2>{label(item)}</h2><p className="muted">Saved {dateLabel(item.created_at)} · Opens {itemDataset(item) === 'private' ? 'private scan results' : 'public internet data'}</p><details><summary>Query details</summary><pre>{item.query}</pre></details></div><div className="cluster"><Button disabled={busy} onClick={() => { try { const request = parseSavedQuery(item.query); setRestoreError(''); navigate(`${searchPath(itemDataset(item))}?${encodeSearch(request)}`); } catch (cause) { setRestoreError(cause instanceof Error ? cause.message : 'Invalid saved JSON.'); } }}>Open query</Button><Button variant="secondary" disabled={busy || unknownDelete || unknownSave} onClick={() => { remove.reset(); setSelected(item); }}>Delete</Button></div></article>)}<p className="muted">Opening a saved query retrieves current data using your current access and credits.</p></>}<Dialog open={selected !== null} onClose={() => { if (!remove.isPending) setSelected(null); }} title="Delete saved query?" footer={<><Button variant="secondary" disabled={remove.isPending} onClick={() => setSelected(null)}>Cancel</Button><Button variant="danger" loading={remove.isPending} disabled={unknownDelete} onClick={() => { if (selected) remove.mutate(selected); }}>Delete query</Button></>}><p>This removes the selected saved query from your account. Your current search results stay available.</p>{selected && <div className="search-confirmed-record"><strong>{label(selected)}</strong><small className="muted">Saved {dateLabel(selected.created_at)}</small></div>}{remove.error && <Alert tone={unknownDelete ? 'warning' : 'error'} title={unknownDelete ? 'Deletion outcome is not confirmed' : 'The query could not be deleted'} actions={unknownDelete ? <Button variant="secondary" onClick={() => void reconcile()}>Check current list</Button> : undefined}>{remove.error.message}</Alert>}</Dialog></div>;
}
