import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ApiError, type NotificationsData } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, EmptyState, Icon, PageHeader, Pagination, Spinner } from '../../components/ui';
import { errorMessage, formatTimestamp } from '../../lib/format';
import './notifications.css';

const titles: Record<string, string> = { subscription_activated: 'Plan activated', subscription_renewed: 'Plan renewed', subscription_expiring: 'Plan expires soon', subscription_expired: 'Plan expired', subscription_canceled: 'Plan renewal canceled', balance_increased: 'Account balance updated', payment_received: 'Payment observed', payment_expired: 'Payment expired', token_pack_purchased: 'Credit pack purchased', team_member_added: 'Team invitation', team_member_removed: 'Team access updated', team_member_left: 'Team member left' };
export function NotificationsPage() {
  const { api, session, user, toast } = useApp(), queryClient = useQueryClient();
  const [page, setPage] = useState(1), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const [unknown, setUnknown] = useState<string | null>(null), inFlight = useRef(false);
  const account = session.status === 'authenticated';
  const query = useQuery({ queryKey: ['notifications', user?.user_id, page], enabled: account, queryFn: async ({ signal }) => {
    const frame = await api.request<NotificationsData>('get_notifications', { limit: 20, offset: (page - 1) * 20 }, { signal });
    if (!frame.data || !Array.isArray(frame.data.notifications)) throw new Error('The notification response was incomplete.');
    return frame.data;
  } });
  useEffect(() => api.subscribe(frame => { if (frame.type === 'unread_notifications') void queryClient.invalidateQueries({ queryKey: ['notifications', user?.user_id] }); }), [api, queryClient, user?.user_id]);
  useEffect(() => { if (!unknown || !query.data) return; if (unknown === 'all' ? query.data.unread_count === 0 : query.data.notifications.some(item => item.id === unknown && item.is_read)) { setUnknown(null); setError(''); } }, [query.data, unknown]);
  async function mark(id?: string) {
    if (inFlight.current || unknown) return;
    inFlight.current = true; setBusy(id ?? 'all'); setError('');
    try {
      const frame = await api.request<{ status: string }>(id ? 'mark_notification_read' : 'mark_all_notifications_read', id ? { id } : {}, { mutation: true });
      if (frame.data?.status !== (id ? 'marked_as_read' : 'all_marked_as_read')) throw new Error('The server did not confirm the notification update.');
      await queryClient.invalidateQueries({ queryKey: ['notifications', user?.user_id] });
      toast(id ? 'Notification marked as read.' : 'All notifications marked as read.', 'success');
    } catch (cause) { setError(errorMessage(cause)); if (cause instanceof ApiError && cause.outcome === 'unknown') setUnknown(id ?? 'all'); }
    finally { setBusy(null); inFlight.current = false; }
  }
  return <div className="notifications-page"><PageHeader title="Notifications" description="Updates about your access, payments and team, in one place." actions={account && <><Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}><Icon name="refresh" size={17} />Refresh</Button><Button variant="secondary" loading={busy === 'all'} disabled={!query.data?.unread_count || !!busy || !!unknown} onClick={() => void mark()}>Mark all as read</Button></>} />{!account ? <EmptyState icon={<Icon name="bell" size={28} />} title="Your account updates live here" description="Sign in to view notifications. Guest sessions do not have a notification inbox." actions={<Link className="button" to="/auth/login?returnTo=%2Fnotifications">Sign in</Link>} /> : <div className="stack">{error && <Alert tone="warning" title={unknown ? 'Update not yet confirmed' : 'Notification could not be updated'} actions={<Button variant="secondary" onClick={() => void query.refetch()}>Check current status</Button>}>{error}{unknown && ' Refresh the inbox before attempting another update.'}</Alert>}{query.isPending ? <Spinner label="Loading notifications" /> : query.error ? <Alert tone="error" title="Inbox unavailable" actions={<Button variant="secondary" onClick={() => void query.refetch()}>Try again</Button>}>{errorMessage(query.error)}</Alert> : query.data && <><div className="notification-summary"><p>{query.data.total.toLocaleString()} notifications</p><Badge tone={query.data.unread_count ? 'accent' : 'neutral'}>{query.data.unread_count} unread</Badge></div>{query.data.notifications.length ? <ol className="notification-list">{query.data.notifications.map(item => <li key={item.id} className={item.is_read ? '' : 'notification--unread'}><div className="notification-symbol"><Icon name={item.notification_type.startsWith('team') ? 'user' : item.notification_type.includes('payment') || item.notification_type.startsWith('subscription') ? 'card' : 'bell'} size={21} /></div><div className="notification-content"><div className="cluster"><h2>{titles[item.notification_type] || item.notification_type.replaceAll('_', ' ')}</h2>{!item.is_read && <span className="unread-dot" role="img" aria-label="Unread" />}</div><p>{item.message || 'An account update is available.'}</p>{item.notification_type === 'payment_received' && <p className="notification-note">A payment observation does not confirm plan activation. Check billing for your current access.</p>}<time dateTime={new Date(item.created_at * 1000).toISOString()}>{formatTimestamp(item.created_at)}</time></div><div className="notification-actions">{item.notification_type.includes('payment') || item.notification_type.startsWith('subscription') ? <Link className="inline-link" to="/billing">View billing</Link> : item.notification_type.startsWith('team') ? <Link className="inline-link" to="/account/team">View team</Link> : null}{!item.is_read && <Button variant="ghost" size="sm" loading={busy === item.id} disabled={!!busy || !!unknown} onClick={() => void mark(item.id)}>Mark as read</Button>}</div></li>)}</ol> : <EmptyState icon={<Icon name="check" size={28} />} title="You’re all caught up" description="Account and team updates will appear here." />}<Pagination page={page} pageSize={20} count={query.data.notifications.length} total={query.data.total} onPageChange={setPage} /></>}</div>}</div>;
}
