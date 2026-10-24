import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { ApiError, isApiError, type SavedQueries, type SearchRequest } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Dialog, Icon, Skeleton } from '../../components/ui';
import { CodeCanvas } from '../../components/CodeCanvas';
import { copyText } from '../account/operation';
import { isShared, parseSavedQuery, queryLabel, withoutShareToken, type Dataset } from './model';

export function SaveQueryDialog({ request, dataset, onClose }: { request: SearchRequest; dataset: Dataset; onClose: () => void }) {
  const { api, session, user, metadata, toast } = useApp();
  const queryClient = useQueryClient();
  const location = useLocation();
  const savedPath = `/search/saved${dataset === 'private' ? '?dataset=private' : ''}`;
  const principal = user?.user_id || user?.session_id || session.status;
  const queryKey = ['saved-queries', principal];
  const shared = isShared(request);
  const allowed = session.status === 'authenticated' && (metadata?.full_access === true || ['Plus', 'Expert', 'Business'].includes(user?.subscription?.type ?? metadata?.subscription_type ?? ''));
  const payload = withoutShareToken(request);
  const serialized = JSON.stringify(payload);
  const list = useQuery({ queryKey, enabled: allowed, staleTime: 30_000, refetchOnMount: 'always', queryFn: async ({ signal }) => {
    const response = await api.request<SavedQueries>('query_list', {}, { signal });
    if (!Array.isArray(response.data)) throw new Error('The saved-query list could not be read. Try refreshing it.');
    return response.data;
  } });
  const alreadySaved = list.data?.some(item => { try { return JSON.stringify(parseSavedQuery(item.query)) === serialized; } catch { return false; } }) ?? false;
  const save = useMutation({ mutationFn: async () => {
    if (!allowed || shared) throw new Error('Open this query with your own account access before saving it.');
    const response = await api.request<{ success: boolean }>('query_create', payload, { mutation: true });
    if (response.data?.success !== true) throw new ApiError('unknown', 'The save has not been confirmed. Check the current list before trying again.', { outcome: 'unknown' });
  }, onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey });
    toast('Query saved.', 'success');
  } });
  const uncertain = isApiError(save.error) && save.error.outcome === 'unknown';
  const saved = alreadySaved || save.isSuccess;
  async function reconcile() { const result = await list.refetch(); if (result.isSuccess) save.reset(); }

  return <Dialog open onClose={() => { if (!save.isPending) onClose(); }} title="Save query" size="sm" className="search-action-dialog search-save-dialog" footer={<>
    <Button variant="secondary" disabled={save.isPending} onClick={onClose}>{saved ? 'Done' : 'Cancel'}</Button>
    {saved ? <Link className="button" to={savedPath} onClick={onClose}>Saved queries<Icon name="arrow" size={16} /></Link> : <Button loading={save.isPending} disabled={!allowed || shared || !list.isSuccess || list.isFetching || (list.data?.length ?? 0) >= 20 || uncertain} onClick={() => save.mutate()}><Icon name="bookmark" size={17} />Save current query</Button>}
  </>}>
    <div className="search-save-content stack" data-onboarding="save-query-dialog" data-state={saved ? 'saved' : 'ready'}>
      <div className="search-save-summary"><span className="search-save-symbol"><Icon name={saved ? 'check' : 'bookmark'} size={22} /></span><div><h3>{queryLabel(payload)}</h3><p><Badge>{dataset === 'private' ? 'Private scans' : 'Public internet'}</Badge>{list.data && <span>{list.data.length} of 20 saved</span>}</p></div></div>
      <p className="muted">Keep these conditions in Saved queries. Opening the query later loads current results.</p>
      {dataset === 'private' && <p className="search-share-limit">{request.task_ids?.length ? `${request.task_ids.length} selected scan ${request.task_ids.length === 1 ? 'task' : 'tasks'} included.` : 'The query applies to your private scans.'}</p>}
      {shared && <Alert tone="info">This link uses its creator’s access. Start your own search before saving the query.</Alert>}
      {!allowed && <Alert tone="info" title={session.status === 'authenticated' ? 'Plus or higher is required' : 'Sign in to save this query'}><Link to={session.status === 'authenticated' ? '/billing?section=plans' : `/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>{session.status === 'authenticated' ? 'Compare plans' : 'Sign in'}</Link></Alert>}
      {allowed && list.isPending && <Skeleton rows={2} label="Checking saved queries" />}
      {list.error && <Alert tone="error" title="Saved queries could not be loaded" actions={<Button variant="secondary" size="sm" onClick={() => void list.refetch()}>Try again</Button>}>{list.error.message}</Alert>}
      {saved && <div className="search-save-confirmation" role="status"><Icon name="check" size={18} /><span>{save.isSuccess ? 'Query saved. It is ready in Saved queries.' : 'This query is already in Saved queries.'}</span></div>}
      {!saved && (list.data?.length ?? 0) >= 20 && <Alert tone="info">All 20 saved-query slots are in use. <Link to={savedPath}>Manage saved queries</Link> to free a slot.</Alert>}
      {save.error && <Alert tone={uncertain ? 'warning' : 'error'} title={uncertain ? 'Save not confirmed' : 'Query could not be saved'} actions={uncertain ? <Button variant="secondary" size="sm" loading={list.isFetching} onClick={() => void reconcile()}>Check current list</Button> : undefined}>{save.error.message}</Alert>}
      <details className="search-action-conditions"><summary>Included conditions<Icon name="chevron-down" size={16} /></summary><CodeCanvas content={JSON.stringify(payload, null, 2)} language="json" title="Saved request" onCopy={text => copyText(text, toast)} /></details>
    </div>
  </Dialog>;
}
