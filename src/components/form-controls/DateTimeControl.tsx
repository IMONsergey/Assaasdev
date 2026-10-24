import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { FloatingPanel } from './FloatingPanel';
import { ControlIcon, valueEvent } from './shared';
import { calendarDate, calendarGrid, dateString, parseCalendarValue, twoDigits, validateCalendarValue, type CalendarValue } from './date-model';

const months = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(calendarDate(2026, month)));
const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayLabel = (day: CalendarValue) => new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(calendarDate(day.year, day.month, day.day));
const today = (): CalendarValue => { const current = new Date(); return { year: current.getUTCFullYear(), month: current.getUTCMonth(), day: current.getUTCDate(), hour: 0, minute: 0, second: 0 }; };

export type DateTimeControlProps = InputHTMLAttributes<HTMLInputElement> & { labelText: string };

export function DateTimeControl({ labelText, type = 'datetime-local', id: explicit, value, defaultValue, onChange, onBlur, onFocus, onInvalid, min, max, step, className = '', readOnly, disabled, required, ...props }: DateTimeControlProps) {
  const generated = useId(), id = explicit ?? generated, popupId = `${id}-calendar`, withTime = type !== 'date';
  const input = useRef<HTMLInputElement>(null), anchor = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [internal, setInternal] = useState(String(defaultValue ?? ''));
  const controlled = value === undefined ? internal : String(value);
  const [text, setText] = useState(controlled.replace('T', ' ')), [error, setError] = useState(''), [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CalendarValue>(() => parseCalendarValue(controlled, withTime) ?? today());
  const [month, setMonth] = useState(() => [draft.year, draft.month]);
  const [monthPicker, setMonthPicker] = useState(false), [yearText, setYearText] = useState(String(draft.year));
  const [time, setTime] = useState({ hour: twoDigits(draft.hour), minute: twoDigits(draft.minute), second: twoDigits(draft.second) });
  const currentValue = useRef(controlled); currentValue.current = controlled;
  const lastEmittedValue = useRef<string | null>(null);
  const constraints = { withTime, min, max, step };
  const validate = (raw: string) => validateCalendarValue(raw, constraints);
  useEffect(() => {
    // A valid minute may be emitted while the user is still adding seconds.
    // Keep their cursor and text intact until blur; external changes still sync.
    if (document.activeElement !== input.current || lastEmittedValue.current !== controlled) setText(controlled.replace('T', ' '));
    setError('');
    input.current?.setCustomValidity(validateCalendarValue(controlled, { withTime, min, max, step }));
  }, [controlled, withTime, min, max, step]);
  useEffect(() => {
    const field = input.current, form = field?.form, dialog = field?.closest('dialog');
    const reset = () => { setText(currentValue.current.replace('T', ' ')); setError(''); setOpen(false); field?.setCustomValidity(''); };
    form?.addEventListener('reset', reset);
    const observer = dialog ? new MutationObserver(() => { if (!dialog.open) reset(); }) : null;
    if (dialog && observer) observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    return () => { form?.removeEventListener('reset', reset); observer?.disconnect(); };
  }, []);
  useEffect(() => { if (disabled || readOnly) setOpen(false); }, [disabled, readOnly]);
  const close = (restore = false) => { setOpen(false); if (restore) requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); };
  function emit(next: string) { lastEmittedValue.current = next; setInternal(next); setText(next.replace('T', ' ')); setError(''); input.current?.setCustomValidity(''); onChange?.(valueEvent<HTMLInputElement>(next, input.current)); }
  function start() {
    if (disabled || readOnly) return;
    if (open) { close(); return; }
    const next = parseCalendarValue(text, withTime) ?? parseCalendarValue(controlled, withTime) ?? today();
    setDraft(next); setMonth([next.year, next.month]); setYearText(String(next.year)); setMonthPicker(false);
    setTime({ hour: twoDigits(next.hour), minute: twoDigits(next.minute), second: twoDigits(next.second) }); setOpen(true);
  }
  useEffect(() => { if (open && !monthPicker) { const frame = requestAnimationFrame(() => document.getElementById(`${popupId}-day-${dateString(draft, false)}`)?.focus({ preventScroll: true })); return () => cancelAnimationFrame(frame); } }, [open, monthPicker, popupId]);
  function changeMonth(amount: number) {
    const next = calendarDate(month[0], month[1] + amount);
    if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) return;
    setMonth([next.getUTCFullYear(), next.getUTCMonth()]); setYearText(String(next.getUTCFullYear()));
  }
  function chooseDay(next: CalendarValue) { setDraft(previous => ({ ...previous, year: next.year, month: next.month, day: next.day })); setMonth([next.year, next.month]); }
  function dayKeyboard(event: KeyboardEvent<HTMLButtonElement>, day: CalendarValue) {
    const weekday = (calendarDate(day.year, day.month, day.day).getUTCDay() + 6) % 7;
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : event.key === 'ArrowDown' ? 7 : event.key === 'Home' ? -weekday : event.key === 'End' ? 6 - weekday : null;
    const nextDate = delta !== null ? calendarDate(day.year, day.month, day.day + delta) : event.key === 'PageUp' || event.key === 'PageDown' ? calendarDate(day.year, day.month + (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1), Math.min(day.day, calendarDate(day.year, day.month + (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1) + 1, 0).getUTCDate())) : null;
    if (!nextDate || nextDate.getUTCFullYear() < 1 || nextDate.getUTCFullYear() > 9999) return;
    event.preventDefault();
    const next = { ...day, year: nextDate.getUTCFullYear(), month: nextDate.getUTCMonth(), day: nextDate.getUTCDate() };
    chooseDay(next); requestAnimationFrame(() => document.getElementById(`${popupId}-day-${dateString(next, false)}`)?.focus({ preventScroll: true }));
  }
  const currentDay = dateString(today(), false), selectedDay = dateString(draft, false);
  const completeTime = Object.values(time).every(part => /^\d{1,2}$/.test(part));
  const completeDraft = { ...draft, hour: Number(time.hour), minute: Number(time.minute), second: Number(time.second) };
  const draftValue = dateString(completeDraft, withTime, true);
  const draftError = completeTime ? validate(draftValue) : 'Enter a complete time.';
  const describedBy = [props['aria-describedby'], error ? `${id}-validation` : ''].filter(Boolean).join(' ') || undefined;
  return <div className={`date-control ${className}`}>
    <div ref={anchor} className="date-control-input" data-open={open || undefined}>
      <input {...props} ref={input} id={id} type="text" value={text} min={min} max={max} step={step} disabled={disabled} readOnly={readOnly} required={required} autoComplete="off" spellCheck={false} placeholder={props.placeholder ?? (withTime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD')} aria-invalid={!!error || props['aria-invalid'] || undefined} aria-describedby={describedBy} onChange={event => {
        const raw = event.target.value, problem = validate(raw); setText(raw); event.currentTarget.setCustomValidity(problem);
        const parsed = parseCalendarValue(raw, withTime);
        if (!raw || (parsed && !problem)) { const next = parsed ? dateString(parsed, withTime, withTime && (String(step) === '1' || raw.length >= 19)) : ''; lastEmittedValue.current = next; setInternal(next); onChange?.(valueEvent<HTMLInputElement>(next, input.current)); setError(''); }
        else setError(raw.length >= (withTime ? 19 : 10) && !/[T :]$/.test(raw) ? problem : '');
      }} onBlur={event => { const problem = validate(text), parsed = parseCalendarValue(text, withTime); setError(problem); event.currentTarget.setCustomValidity(problem); if (parsed && !problem) setText(dateString(parsed, withTime, withTime && (String(step) === '1' || text.length >= 19)).replace('T', ' ')); onBlur?.(event); }} onFocus={onFocus} onInvalid={event => { event.preventDefault(); setError(validate(text) || (required ? 'Choose a date.' : 'Check this date.')); input.current?.focus({ preventScroll: true }); onInvalid?.(event); }} onKeyDown={event => { if (event.key === 'ArrowDown' && event.altKey) { event.preventDefault(); start(); } props.onKeyDown?.(event); }} />
      <button ref={trigger} type="button" className="date-control-trigger" aria-label={`Choose ${labelText.toLowerCase()}`} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? popupId : undefined} disabled={disabled || readOnly} onClick={start}><ControlIcon name="calendar" /></button>
    </div>
    {error && <span className="field-error control-date-error" id={`${id}-validation`} role="alert">{error}</span>}
    <FloatingPanel anchor={anchor} open={open} onDismiss={close} width={320} id={popupId} role="dialog" label={`${labelText} calendar`} className="calendar-popover">
      <div className="calendar-header"><button type="button" className="calendar-nav" aria-label={monthPicker ? 'Previous year' : 'Previous month'} disabled={month[0] === 1 && (monthPicker || month[1] === 0)} onClick={() => changeMonth(monthPicker ? -12 : -1)}><ControlIcon name="chevron-left" /></button><button type="button" className="calendar-month-title" aria-label="Choose month and year" aria-expanded={monthPicker} onClick={() => { setMonthPicker(previous => !previous); setYearText(String(month[0])); }}>{months[month[1]]} <span>{month[0]}</span><ControlIcon name="chevron-down" /></button><button type="button" className="calendar-nav" aria-label={monthPicker ? 'Next year' : 'Next month'} disabled={month[0] === 9999 && (monthPicker || month[1] === 11)} onClick={() => changeMonth(monthPicker ? 12 : 1)}><ControlIcon name="chevron-right" /></button></div>
      {monthPicker ? <div className="calendar-month-picker"><label className="calendar-year-label">Year<input type="text" inputMode="numeric" value={yearText} maxLength={4} aria-label="Calendar year" onChange={event => { const next = event.target.value.replace(/\D/g, ''); setYearText(next); if (Number(next) >= 1 && Number(next) <= 9999) setMonth([Number(next), month[1]]); }} onBlur={() => setYearText(String(month[0]))} /></label><div className="calendar-month-grid">{months.map((name, index) => <button type="button" key={name} aria-pressed={index === month[1]} onClick={() => { setMonth([month[0], index]); setMonthPicker(false); }}>{name.slice(0, 3)}</button>)}</div></div> : <div className="calendar-grid" role="grid" aria-label={`${months[month[1]]} ${month[0]}`}><div className="calendar-weekdays" role="row">{weekdayNames.map(name => <span role="columnheader" aria-label={name} key={name}>{name.slice(0, 2)}</span>)}</div>{Array.from({ length: 6 }, (_, week) => <div role="row" className="calendar-week" key={week}>{calendarGrid(month[0], month[1]).slice(week * 7, week * 7 + 7).map(day => {
        const dayValue = dateString(day, false), outside = day.month !== month[1], chosen = dayValue === selectedDay;
        const minimum = parseCalendarValue(String(min ?? ''), withTime), maximum = parseCalendarValue(String(max ?? ''), withTime);
        const unavailable = day.year < 1 || day.year > 9999 || (minimum && dayValue < dateString(minimum, false)) || (maximum && dayValue > dateString(maximum, false));
        return <button id={`${popupId}-day-${dayValue}`} type="button" role="gridcell" aria-label={dayLabel(day)} aria-selected={chosen} aria-current={dayValue === currentDay ? 'date' : undefined} disabled={!!unavailable} tabIndex={chosen ? 0 : -1} className={`calendar-day${outside ? ' is-adjacent' : ''}`} key={dayValue} onClick={() => chooseDay(day)} onKeyDown={event => dayKeyboard(event, day)}>{day.day}</button>;
      })}</div>)}</div>}
      {withTime && <div className="calendar-time"><span>Time <small>UTC</small></span><div>{(['hour', 'minute', 'second'] as const).map((part, index) => <span className="calendar-time-part" key={part}>{index > 0 && <i aria-hidden="true">:</i>}<input type="text" inputMode="numeric" aria-label={`${part === 'hour' ? 'Hours' : part === 'minute' ? 'Minutes' : 'Seconds'} UTC`} maxLength={2} value={time[part]} onFocus={event => event.currentTarget.select()} onChange={event => { const next = event.target.value.replace(/\D/g, '').slice(0, 2); setTime(previous => ({ ...previous, [part]: next })); }} onBlur={() => setTime(previous => ({ ...previous, [part]: twoDigits(Math.min(part === 'hour' ? 23 : 59, Number(previous[part]) || 0)) }))} /></span>)}</div></div>}
      <div className="calendar-footer"><button type="button" className="calendar-clear" onClick={() => { emit(''); close(true); }}>Clear</button><button type="button" className="calendar-today" onClick={() => { const next = today(); setDraft(previous => ({ ...previous, ...next, hour: previous.hour, minute: previous.minute, second: previous.second })); setMonth([next.year, next.month]); setMonthPicker(false); }}>Today</button><button type="button" className="calendar-apply" disabled={!!draftError} onClick={() => { emit(draftValue); close(true); }}>Apply</button></div>
    </FloatingPanel>
  </div>;
}
