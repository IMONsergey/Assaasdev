import { describe, expect, it } from 'vitest';
import { arrayColumnCount, compareCells, exploreRows, receivedTable } from './data-model';

describe('received data exploration', () => {
  it('searches and sorts the full ten-thousand-row response before paging', () => {
    const table = receivedTable(Array.from({ length: 10000 }, (_, index) => [`record-${String(index).padStart(5, '0')}`, String(index), index % 2 ? 'odd' : 'even']), ['Record', 'Sequence', 'Group']);
    expect(exploreRows(table.rows, 'record-09999', null, 'asc').map(row => row.index)).toEqual([9999]);
    const descending = exploreRows(table.rows, 'odd', 1, 'desc');
    expect(descending).toHaveLength(5000);
    expect(descending.slice(0, 50).map(row => row.index)).toEqual(Array.from({ length: 50 }, (_, index) => 9999 - index * 2));
    expect(exploreRows(table.rows, '', 1, 'asc').slice(0, 12).map(row => row.cells[1])).toEqual(Array.from({ length: 12 }, (_, index) => String(index)));
    expect(table.rows[0].index).toBe(0);
  });
  it('retains uneven rows, absent headers and mixed nested values without a render assumption', () => {
    const table = receivedTable([['known', 'extra'], ['short'], null, { label: 'unusual' }], ['First']);
    expect(table.columns).toEqual(['First', 'Column 2']);
    expect(table.rows).toHaveLength(4);
    expect(table.rows[2].cells).toEqual([null]);
    expect(exploreRows(table.rows, 'unusual', null, 'asc')[0].index).toBe(3);
    expect(receivedTable([{ name: 'one' }, { name: 'two', count: 0 }]).columns).toEqual(['name', 'count']);
    expect(arrayColumnCount([['one', 'unnamed']], [])).toBe(2);
    expect(receivedTable([['one', 'unnamed']], []).columns).toHaveLength(2);
    expect(arrayColumnCount([['one']], ['First', 'Second', 'Third'])).toBe(3);
    expect(arrayColumnCount([], [])).toBe(0);
  });
  it('sorts numeric strings without converting large identifiers to imprecise numbers', () => {
    expect(compareCells('10', '2')).toBeGreaterThan(0);
    expect(compareCells('9007199254740992', '9007199254740993')).toBeLessThan(0);
    expect(compareCells(undefined, 0)).toBeGreaterThan(0);
    expect(compareCells(false, true)).toBeLessThan(0);
  });
});
