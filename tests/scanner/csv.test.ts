import { expect, it } from 'vitest';
import { detectTargetColumn, parseCsv } from '../../src/features/scanner/csv';

it('reads quoted CSV with embedded commas, line breaks, escaped quotes and a BOM', () => {
  expect(parseCsv('\uFEFFhost,note\r\nexample.com,"two, fields"\r\n192.0.2.10,"a ""quote""\nnext line"')).toEqual([['host','note'],['example.com','two, fields'],['192.0.2.10','a "quote"\nnext line']]);
  expect(parseCsv('host;note\nexample.com;test')).toEqual([['host','note'],['example.com','test']]);
  expect(() => parseCsv('host\n"unclosed')).toThrow();
});

it('ignores delimiters and line breaks inside quoted headers when detecting CSV format', () => {
  expect(parseCsv('"notes; labels; other",ip\n"first; note",192.0.2.10')).toEqual([['notes; labels; other', 'ip'], ['first; note', '192.0.2.10']]);
  expect(parseCsv('"notes, labels, other";ip\n"first, note";192.0.2.10')).toEqual([['notes, labels, other', 'ip'], ['first, note', '192.0.2.10']]);
  expect(parseCsv('"notes\ncontinued";ip\nhello;192.0.2.10')).toHaveLength(2);
});

it('preserves the first target in headerless imports and selects a named target column', () => {
  expect(detectTargetColumn(parseCsv('192.0.2.10\n192.0.2.11'))).toEqual({ header: false, column: 0 });
  expect(detectTargetColumn(parseCsv('example.com\n192.0.2.0/28'))).toEqual({ header: false, column: 0 });
  expect(detectTargetColumn(parseCsv('Note,IP address\nEdge,192.0.2.10'))).toEqual({ header: true, column: 1 });
});
