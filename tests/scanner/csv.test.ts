import { expect, it } from 'vitest';
import { parseCsv } from '../../src/features/scanner/csv';

it('reads quoted CSV with embedded commas, line breaks, escaped quotes and a BOM', () => {
  expect(parseCsv('\uFEFFhost,note\r\nexample.com,"two, fields"\r\n192.0.2.10,"a ""quote""\nnext line"')).toEqual([['host','note'],['example.com','two, fields'],['192.0.2.10','a "quote"\nnext line']]);
  expect(parseCsv('host;note\nexample.com;test')).toEqual([['host','note'],['example.com','test']]);
  expect(() => parseCsv('host\n"unclosed')).toThrow();
});
