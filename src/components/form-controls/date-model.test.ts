import { describe, expect, it } from 'vitest';
import { calendarGrid, calendarSeconds, dateString, parseCalendarValue, validateCalendarValue } from './date-model';

describe('calendar control UTC boundaries', () => {
  it('keeps seconds and years below 100 exactly without local timezone conversion', () => {
    for (const raw of ['2026-10-24T15:30:59', '0099-01-02T03:04:05', '0001-01-01T00:00:00', '9999-12-31T23:59:59']) {
      const parsed = parseCalendarValue(raw)!;
      expect(dateString(parsed)).toBe(raw);
      expect(new Date(calendarSeconds(parsed) * 1000).toISOString().slice(0, 19)).toBe(raw);
    }
  });
  it('rejects overflowed dates and distinguishes Gregorian leap centuries', () => {
    expect(parseCalendarValue('2000-02-29 23:59:59')).not.toBeNull();
    for (const raw of ['1900-02-29T12:00:00', '2026-02-29T12:00:00', '2026-04-31T12:00:00', '2026-10-24T24:00:00', '2026-10-24T12:60:00', '2026-10-24T12:00:60', '0000-01-01T00:00:00']) expect(parseCalendarValue(raw)).toBeNull();
  });
  it('honors inclusive min/max and the step origin without rounding the submitted value', () => {
    const constraints = { min: '2026-10-24T12:00:03', max: '2026-10-24T13:00:03', step: 60 };
    expect(validateCalendarValue('2026-10-24T12:00:03', constraints)).toBe('');
    expect(validateCalendarValue('2026-10-24T13:00:03', constraints)).toBe('');
    expect(validateCalendarValue('2026-10-24T12:01:03', constraints)).toBe('');
    expect(validateCalendarValue('2026-10-24T12:01:04', constraints)).not.toBe('');
    expect(validateCalendarValue('2026-10-24T11:59:03', constraints)).not.toBe('');
    expect(validateCalendarValue('2026-10-24T13:00:04', { ...constraints, step: 1 })).not.toBe('');
    expect(validateCalendarValue('2026-10-24T12:01:04', { ...constraints, step: 'any' })).toBe('');
  });
  it('provides continuous Monday-based weeks across month and year boundaries', () => {
    const january = calendarGrid(2027, 0);
    expect(dateString(january[0], false)).toBe('2026-12-28');
    expect(january).toHaveLength(42);
    for (let index = 1; index < january.length; index++) expect(calendarSeconds(january[index]) - calendarSeconds(january[index - 1])).toBe(86400);
    expect(calendarGrid(1, 0).some(day => day.year === 1 && day.month === 0 && day.day === 1)).toBe(true);
  });
});
