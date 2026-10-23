import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ApiError } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, EmptyState, Icon, PageHeader, Pagination, Spinner } from '../../components/ui';
import { errorMessage } from '../../lib/format';
import { normalizeInbox, notificationTime, notificationTitle, type InboxData } from './model';
import './notifications.css';

type InboxSnapshot = InboxData & { page: number; principal: string };

export function NotificationsPage() {
  const { api, session, user, toast } = useApp(), queryClient = useQueryClient();
  const [page, setPage] = useState(1), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const [unknown, setUnknown] = useState<string | null>(null), inFlight = useRef(false);
  const account = session.status === 'authenticated';
  const principal = user?.user_id || user?.session_id || session.status;
  const query = useQuery<InboxSnapshot>({
    queryKey: ['notifications', principal, page], enabled: account,
    placeholderData: previous => previous?.principal === principal ? previous : undefined,
    queryFn: async ({ signal }) => {
      const frame = await api.request<unknown>('get_notifications', { limit: 20, offset: (page - 1) * 20 }, { signal });
      return { ...normalizeInbox(frame.data), page, principal };
    },
  });
  const shown = query.data?.principal === principal ? query.data : undefined;

  useEffect(() => {
    if (!account) return;
    return api.subscribe(frame => {
      if (frame.type === 'unread_notifications') void queryClient.invalidateQueries({ queryKey: ['notifications', principal] });
    });
  }, [account, api, queryClient, principal]);
  useEffect(() => {
    if (!unknown || !shown) return;
    if (unknown === 'all' ? shown.unread_count === 0 : shown.notifications.some(item => item.id === unknown && item.is_read === true)) { setUnknown(null); setError(''); }
  }, [shown, unknown]);
  useEffect(() => { setPage(1); setUnknown(null); setError(''); }, [principal]);

  async function mark(id?: string) {
    if (inFlight.current || unknown) return;
    inFlight.current = true; setBusy(id ?? 'all'); setError('');
    try {
      const frame = await api.request<{ status: string }>(id ? 'mark_notification_read' : 'mark_all_notifications_read', id ? { id } : {}, { mutation: true });
      if (frame.data?.status !== (id ? 'marked_as_read' : 'all_marked_as_read')) throw new ApiError('unknown', 'The server did not confirm the notification update.', { outcome: 'unknown' });
      await queryClient.invalidateQueries({ queryKey: ['notifications', principal] });
      toast(id ? 'Notification marked as read.' : 'All notifications marked as read.', 'success');
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.outcome === 'unknown') setUnknown(id ?? 'all');
    } finally { setBusy(null); inFlight.current = false; }
  }

  return <div className="notifications-page">
    <PageHeader title="Notifications" description="Updates about your access, payments and team, in one place." actions={account && <>
      <Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}><Icon name="refresh" size={17} />Refresh</Button>
      <Button variant="secondary" loading={busy === 'all'} disabled={!shown?.unread_count || query.isFetching || !!busy || !!unknown} onClick={() => void mark()}>Mark all as read</Button>
    </>} />
    {session.status === 'loading' ? <Spinner label="Checking your account" /> : !account ?
      <EmptyState icon={<Icon name="bell" size={28} />} title="Your account updates live here" description="Sign in to view notifications. Guest sessions do not have a notification inbox." actions={<Link className="button" to="/auth/login?returnTo=%2Fnotifications">Sign in</Link>} /> :
      <div className="stack">
        {error && <Alert tone="warning" title={unknown ? 'Update not yet confirmed' : 'Notification could not be updated'} actions={<Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Check current status</Button>}>{error}{unknown && ' Refresh the inbox before attempting another update.'}</Alert>}
        {query.isPending && <Spinner label="Loading notifications" />}
        {query.error && <Alert tone="error" title={shown ? 'Inbox could not be refreshed' : 'Inbox unavailable'} actions={<Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Try again</Button>}>{errorMessage(query.error)}{shown && ' Your last successfully loaded notifications remain below.'}</Alert>}
        {shown && <>
          {query.isFetching && <Spinner label="Updating the inbox. The previous response remains visible." />}
          {shown.partial && <Alert tone="info" title="Some notification details are unavailable">{shown.skippedCount > 0 ? `${shown.skippedCount} incomplete ${shown.skippedCount === 1 ? 'record could' : 'records could'} not be displayed. ` : ''}The received updates are shown below. Refresh the inbox to check for complete details.</Alert>}
          <div className="notification-summary"><p>{shown.total === undefined ? 'Notifications' : `${shown.total.toLocaleString()} notifications`}</p><Badge tone={shown.unread_count ? 'accent' : 'neutral'}>{shown.unread_count === undefined ? 'Unread count unavailable' : `${shown.unread_count.toLocaleString()} unread`}</Badge></div>
          {shown.notifications.length ? <ol className="notification-list" aria-busy={query.isFetching}>
            {shown.notifications.map(item => {
              const team = item.notification_type.startsWith('team');
              const billing = item.notification_type.includes('payment') || item.notification_type.startsWith('subscription') || item.notification_type === 'token_pack_purchased';
              const time = notificationTime(item.created_at);
              return <li key={item.id} className={item.is_read === false ? 'notification--unread' : ''}>
                <div className="notification-symbol"><Icon name={team ? 'user' : billing ? 'card' : 'bell'} size={21} /></div>
                <div className="notification-content">
                  <div className="cluster"><h2>{notificationTitle(item.notification_type)}</h2>{item.is_read === false && <span className="unread-dot" role="img" aria-label="Unread" />}</div>
                  <p>{item.message}</p>
                  {item.notification_type === 'payment_received' && <p className="notification-note">A payment observation does not confirm plan activation. Check billing for your current access.</p>}
                  {item.is_read === undefined && <p className="notification-note">Read status unavailable.</p>}
                  {time.iso ? <time dateTime={time.iso}>{time.label}</time> : <span className="notification-time">{time.label}</span>}
                </div>
                <div className="notification-actions">
                  {billing ? <Link className="inline-link" to="/billing">View billing</Link> : team ? <Link className="inline-link" to="/account/team">View team</Link> : null}
                  {item.is_read === false && <Button variant="ghost" size="sm" loading={busy === item.id} disabled={query.isFetching || !!busy || !!unknown} onClick={() => void mark(item.id)}>Mark as read</Button>}
                </div>
              </li>;
            })}
          </ol> : shown.skippedCount > 0 ?
            <EmptyState icon={<Icon name="bell" size={28} />} title="Updates could not be displayed" description="Refresh your inbox to load complete notification records." /> :
            <EmptyState icon={<Icon name="check" size={28} />} title={shown.total === 0 ? 'Your inbox is clear' : 'No notifications on this page'} description={shown.total === 0 ? 'Account and team updates will appear here.' : 'The inbox may have changed since this page was loaded.'} actions={shown.page > 1 ? <Button variant="secondary" disabled={query.isFetching} onClick={() => setPage(1)}>Back to the first page</Button> : undefined} />}
          <Pagination page={shown.page} pageSize={20} count={shown.receivedCount} total={shown.total} disabled={query.isFetching || !!busy || !!unknown} onPageChange={setPage} />
        </>}
      </div>}
  </div>;
}
