/** UTC form values never depend on the viewer's browser time zone. Values that
 * cannot be represented exactly stay in the general range editor. */
export function formatUtcSeconds(value: string | number | undefined): string | null {
  if (value === undefined) return '';
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return null;
  return date.toISOString().slice(0, 19);
}

export function parseUtcSeconds(value: string): number | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) throw new Error('Enter a valid UTC date and time.');
  const complete = value.length === 16 ? `${value}:00` : value;
  const timestamp = Date.parse(`${complete}Z`);
  if (!Number.isFinite(timestamp) || formatUtcSeconds(timestamp / 1000) !== complete) throw new Error('Enter a valid UTC date and time.');
  return timestamp / 1000;
}
