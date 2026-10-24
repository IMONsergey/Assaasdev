import { describe, expect, it } from 'vitest';
import { scheduleLabel } from './model';

describe('schedule presentation', () => {
  it('names only unambiguous six-field recurring patterns without assuming a timezone', () => {
    expect(scheduleLabel('0 * * * * *')).toBe('Every minute');
    expect(scheduleLabel('0 0 * * * *')).toBe('Every hour');
    expect(scheduleLabel('0 0 3 * * *')).toBe('Daily at 03:00 (scanner time)');
    expect(scheduleLabel('0 59 23 * * *')).toBe('Daily at 23:59 (scanner time)');
  });

  it('keeps complex and unsupported expressions custom', () => {
    for (const schedule of ['0 */5 * * * MON-FRI', '0 0 3 * * MON', '0 0 3 1 * *', '0 3 * * *', '0 60 3 * * *', '0 0 24 * * *']) {
      expect(scheduleLabel(schedule)).toBe('Custom schedule');
    }
  });

  it('distinguishes a missing schedule from a confirmed one-time task', () => {
    expect(scheduleLabel(undefined)).toBe('Not provided');
    expect(scheduleLabel('')).toBe('One-time scan');
  });
});
