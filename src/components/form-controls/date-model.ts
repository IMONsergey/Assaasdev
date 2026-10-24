export interface CalendarValue { year: number; month: number; day: number; hour: number; minute: number; second: number }
export const twoDigits = (value: number) => String(value).padStart(2, '0');
export function calendarDate(year: number, month: number, day = 1) {
  const value = new Date(0);
  value.setUTCFullYear(year, month, day); value.setUTCHours(0, 0, 0, 0);
  return value;
}
export function dateString(value: CalendarValue, withTime = true, seconds = true) {
  const date = `${String(value.year).padStart(4, '0')}-${twoDigits(value.month + 1)}-${twoDigits(value.day)}`;
  return withTime ? `${date}T${twoDigits(value.hour)}:${twoDigits(value.minute)}${seconds ? `:${twoDigits(value.second)}` : ''}` : date;
}
export function parseCalendarValue(raw: string, withTime = true): CalendarValue | null {
  const normalized = raw.trim().replace(/[ ,]+/, 'T');
  const match = withTime ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(normalized) : /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const value = { year: +match[1], month: +match[2] - 1, day: +match[3], hour: +(match[4] || 0), minute: +(match[5] || 0), second: +(match[6] || 0) };
  if (value.year < 1 || value.year > 9999 || value.month < 0 || value.month > 11 || value.day < 1 || value.hour > 23 || value.minute > 59 || value.second > 59) return null;
  const checked = calendarDate(value.year, value.month, value.day);
  return checked.getUTCFullYear() === value.year && checked.getUTCMonth() === value.month && checked.getUTCDate() === value.day ? value : null;
}
export function calendarSeconds(value: CalendarValue) { return calendarDate(value.year, value.month, value.day).getTime() / 1000 + value.hour * 3600 + value.minute * 60 + value.second; }
export function validateCalendarValue(raw: string, options: { withTime?: boolean; min?: string | number; max?: string | number; step?: string | number } = {}): string {
  if (!raw) return '';
  const withTime = options.withTime ?? true, value = parseCalendarValue(raw, withTime);
  if (!value) return withTime ? 'Enter a valid date and time.' : 'Enter a valid date.';
  const min = parseCalendarValue(String(options.min ?? ''), withTime), max = parseCalendarValue(String(options.max ?? ''), withTime);
  const timestamp = calendarSeconds(value);
  if (min && timestamp < calendarSeconds(min)) return `Choose ${String(options.min).replace('T', ' ')} or later.`;
  if (max && timestamp > calendarSeconds(max)) return `Choose ${String(options.max).replace('T', ' ')} or earlier.`;
  if (options.step !== 'any') {
    const step = Number(options.step ?? (withTime ? 60 : 1)) * (withTime ? 1 : 86400);
    if (Number.isFinite(step) && step > 0 && Math.abs((timestamp - (min ? calendarSeconds(min) : 0)) / step - Math.round((timestamp - (min ? calendarSeconds(min) : 0)) / step)) > 1e-7) return withTime && step === 60 ? 'Choose a whole minute.' : 'Choose a date and time within the allowed interval.';
  }
  return '';
}
export function calendarGrid(year: number, month: number) {
  const offset = (calendarDate(year, month).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => { const date = calendarDate(year, month, index - offset + 1); return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(), hour: 0, minute: 0, second: 0 }; });
}
