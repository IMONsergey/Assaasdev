import { describe, expect, it } from 'vitest';
import { normalizeInbox, notificationTime, notificationTitle } from './model';

describe('notification display boundary', () => {
  it('keeps useful rows from malformed payloads without inventing timestamps, read state or counts', () => {
    const inbox = normalizeInbox({ total: '3', unread_count: -1, notifications: [
      { id: 'missing-time', notification_type: 42, message: { api_key: 'secret' }, payload: { api_key: 'secret' } },
      { id: 'bad-time', notification_type: 'team_member_added', message: 'Maya joined the team.', is_read: false, created_at: 1e30 },
      { notification_type: 'payment_received', created_at: 123 },
      null,
    ] });
    expect(inbox.partial).toBe(true);
    expect(inbox.skippedCount).toBe(2);
    expect(inbox.receivedCount).toBe(4);
    expect(inbox.total).toBeUndefined();
    expect(inbox.unread_count).toBeUndefined();
    expect(inbox.notifications[0]).toEqual({ id: 'missing-time', notification_type: 'account_update', message: 'An account update is available.', is_read: undefined, created_at: undefined });
    expect(JSON.stringify(inbox)).not.toContain('secret');
    expect(notificationTime(inbox.notifications[1].created_at)).toEqual({ label: 'Time unavailable' });
    expect(notificationTitle(inbox.notifications[1].notification_type)).toBe('Team member added');
    expect(notificationTitle('constructor')).toBe('constructor');
  });

  it('preserves a genuine zero count and a valid epoch timestamp, and rejects a missing list', () => {
    expect(normalizeInbox({ notifications: [], total: 0, unread_count: 0 })).toMatchObject({ total: 0, unread_count: 0, partial: false });
    expect(notificationTime(0)).toMatchObject({ iso: '1970-01-01T00:00:00.000Z' });
    expect(notificationTime(Number.NaN)).toEqual({ label: 'Time unavailable' });
    expect(() => normalizeInbox({ total: 0 })).toThrow('incomplete');
  });
});
