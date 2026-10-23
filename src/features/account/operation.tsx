import { useEffect, useRef, useState } from 'react';
import { ApiError, type ApiFrame } from '../../api';
import { Alert, Button } from '../../components/ui';

export interface OperationState { status: 'idle' | 'pending' | 'success' | 'error' | 'unknown'; message: string; retryAt?: number }

export function useOperation() {
  const [state, setState] = useState<OperationState>({ status: 'idle', message: '' });
  const busy = useRef(false);
  useEffect(() => {
    if (!state.retryAt) return;
    const retryAt = state.retryAt;
    const timer = window.setTimeout(() => setState(current => current.retryAt === retryAt ? { ...current, retryAt: undefined } : current), Math.max(0, retryAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state.retryAt]);
  async function run<T>(operation: () => Promise<T>, successMessage: string): Promise<{ ok: true; data: T } | { ok: false }> {
    if (busy.current || state.status === 'unknown' || (state.retryAt ?? 0) > Date.now()) return { ok: false };
    busy.current = true;
    setState({ status: 'pending', message: '' });
    try {
      const data = await operation();
      setState({ status: 'success', message: successMessage });
      return { ok: true, data };
    } catch (error) {
      const unknown = error instanceof ApiError && error.outcome === 'unknown';
      const retryAt = error instanceof ApiError && error.retryAfterSeconds && Number.isFinite(error.retryAfterSeconds) ? Date.now() + error.retryAfterSeconds * 1000 : undefined;
      setState({ status: unknown ? 'unknown' : 'error', retryAt, message: unknown ? 'The request was sent, but its result could not be confirmed. Check the current state before trying again.' : error instanceof Error ? error.message : 'The operation could not be completed.' });
      return { ok: false };
    } finally { busy.current = false; }
  }
  return { state, run, busy: state.status === 'pending', blocked: state.status === 'pending' || state.status === 'unknown' || (state.retryAt ?? 0) > Date.now(), reset: () => setState({ status: 'idle', message: '' }) };
}

export function OperationNotice({ state, onCheck }: { state: OperationState; onCheck?: () => void }) {
  if (state.status === 'idle' || state.status === 'pending') return null;
  return <Alert tone={state.status === 'unknown' ? 'warning' : state.status === 'error' ? 'error' : 'success'} title={state.status === 'unknown' ? 'Result not confirmed' : undefined} actions={state.status === 'unknown' && onCheck ? <Button variant="secondary" onClick={onCheck}>Check current state</Button> : undefined}>{state.message}{state.retryAt && <p>Try again after {new Date(state.retryAt).toLocaleTimeString()}. No request will be retried automatically.</p>}</Alert>;
}

export function responseData<T>(frame: ApiFrame<T>): T {
  if (frame.data === undefined || frame.data === null) throw new ApiError('unknown', 'The server did not return a complete result. Check the current state before trying again.', { outcome: 'unknown' });
  return frame.data;
}

export function formatNumber(value: number | undefined) { return typeof value !== 'number' || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-US').format(value); }
export function formatDate(seconds: number | undefined) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return 'Not available';
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export async function copyText(value: string, toast: (message: string, tone?: 'success' | 'error' | 'info') => void) {
  try {
    if (!navigator.clipboard) throw new Error('Clipboard access is unavailable. Select and copy the text manually.');
    await navigator.clipboard.writeText(value);
    toast('Copied to clipboard.', 'success');
  } catch (error) { toast(error instanceof Error ? error.message : 'The text could not be copied.', 'error'); }
}
