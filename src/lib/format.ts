export function formatDate(seconds?: number, options?: Intl.DateTimeFormatOptions): string {
  if (!seconds || !Number.isFinite(seconds)) return '—';
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', ...options }).format(date);
}
export function formatTimestamp(seconds?: number): string { return seconds ? `${formatDate(seconds, { hour: '2-digit', minute: '2-digit' })} UTC` : '—'; }
export function number(value?: number): string { return value === undefined ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value); }
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
export async function copyText(text: string): Promise<void> { await navigator.clipboard.writeText(text); }
