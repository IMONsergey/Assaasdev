export interface ReceivedRow { index: number; cells: unknown[]; searchText: string }
export interface ReceivedTable { columns: string[]; rows: ReceivedRow[] }

export function cellText(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Count every received field, including unnamed cells in uneven array rows. */
export function arrayColumnCount(values: readonly unknown[], headers?: readonly unknown[]): number {
  return values.reduce<number>((width, row) => Math.max(width, Array.isArray(row) ? row.length : 1), headers?.length || 0);
}

/** Keep every received cell, including uneven rows and missing column headers. */
export function receivedTable(values: unknown[], headers?: unknown[]): ReceivedTable {
  const safeValues = Array.isArray(values) ? values : [];
  const arrays = headers !== undefined || safeValues.every(Array.isArray);
  if (arrays) {
    const cells = safeValues.map(value => Array.isArray(value) ? value : [value]);
    const width = arrayColumnCount(cells, headers);
    return { columns: Array.from({ length: width }, (_, index) => cellText(headers?.[index]) || `Column ${index + 1}`), rows: cells.map((row, index) => ({ index, cells: row, searchText: row.map(cellText).join('\n').toLocaleLowerCase() })) };
  }
  const records = safeValues.length > 0 && safeValues.every(value => Boolean(value && typeof value === 'object' && !Array.isArray(value)));
  const keys = records ? [...new Set(safeValues.flatMap(value => Object.keys(value as Record<string, unknown>)))] : [];
  const columns = keys.length ? keys : ['Value'];
  return { columns, rows: safeValues.map((value, index) => {
    const cells = keys.length ? keys.map(key => (value as Record<string, unknown>)[key]) : [value];
    return { index, cells, searchText: cells.map(cellText).join('\n').toLocaleLowerCase() };
  }) };
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export function compareCells(left: unknown, right: unknown): number {
  if (left === undefined || left === null) return right === undefined || right === null ? 0 : 1;
  if (right === undefined || right === null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return collator.compare(cellText(left), cellText(right));
}

export function exploreRows(rows: ReceivedRow[], query: string, sortColumn: number | null, direction: 'asc' | 'desc'): ReceivedRow[] {
  const text = query.trim().toLocaleLowerCase();
  const matches = text ? rows.filter(row => row.searchText.includes(text)) : [...rows];
  if (sortColumn !== null) matches.sort((a, b) => compareCells(a.cells[sortColumn], b.cells[sortColumn]) * (direction === 'asc' ? 1 : -1) || a.index - b.index);
  return matches;
}
