export interface InboxItem {
  id: string;
  notification_type: string;
  message: string;
  is_read: boolean | undefined;
  created_at: number | undefined;
}

export interface InboxData {
  notifications: InboxItem[];
  total: number | undefined;
  unread_count: number | undefined;
  receivedCount: number;
  skippedCount: number;
  partial: boolean;
}

const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const timestamp = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isFinite(new Date(value * 1000).getTime()) ? value : undefined;

/** Only display fields are retained; raw notification payloads may contain secrets. */
export function normalizeInbox(value: unknown): InboxData {
  if (!value || typeof value !== 'object' || !('notifications' in value) || !Array.isArray(value.notifications)) throw new Error('The notification response was incomplete. Try refreshing your inbox.');
  const source = value as Record<string, unknown> & { notifications: unknown[] };
  const total = count(source.total), unread = count(source.unread_count);
  let partial = total === undefined || unread === undefined, skippedCount = 0;
  const ids = new Set<string>(), notifications: InboxItem[] = [];
  for (const row of source.notifications) {
    if (!row || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id)) { skippedCount++; partial = true; continue; }
    const record = row as Record<string, unknown>, created_at = timestamp(record.created_at);
    const type = typeof record.notification_type === 'string' && /^[a-zA-Z][a-zA-Z\d_-]{0,127}$/.test(record.notification_type) ? record.notification_type : undefined;
    const is_read = typeof record.is_read === 'boolean' ? record.is_read : undefined;
    if (created_at === undefined || type === undefined || is_read === undefined || (record.message !== undefined && typeof record.message !== 'string')) partial = true;
    ids.add(row.id);
    notifications.push({ id: row.id, notification_type: type ?? 'account_update', message: typeof record.message === 'string' && record.message.trim() ? record.message : 'An account update is available.', is_read, created_at });
  }
  return { notifications, total, unread_count: unread, receivedCount: source.notifications.length, skippedCount, partial };
}

const titles: Record<string, string> = {
  subscription_activated: 'Plan activated', subscription_renewed: 'Plan renewed', subscription_expiring: 'Plan expires soon',
  subscription_expired: 'Plan expired', subscription_canceled: 'Plan renewal canceled', balance_increased: 'Account balance updated',
  payment_received: 'Payment observed', payment_expired: 'Payment expired', token_pack_purchased: 'Credit pack purchased',
  team_member_added: 'Team member added', team_member_removed: 'Team access updated', team_member_left: 'Team member left', account_update: 'Account update',
};
export function notificationTitle(type: string): string { return Object.hasOwn(titles, type) ? titles[type] : type.replaceAll('_', ' ').replaceAll('-', ' '); }

const timeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
export function notificationTime(value: number | undefined): { iso?: string; label: string } {
  const seconds = timestamp(value);
  if (seconds === undefined) return { label: 'Time unavailable' };
  const date = new Date(seconds * 1000);
  return { iso: date.toISOString(), label: `${timeFormat.format(date)} UTC` };
}
