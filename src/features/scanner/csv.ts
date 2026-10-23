/** Local CSV reader: quoted commas, escaped quotes and newlines are preserved. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ',';
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else if (quoted || field.length === 0) quoted = !quoted;
      else field += char;
    } else if (!quoted && char === delimiter) { row.push(field); field = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) { row.push(field); if (row.some(value => value.trim())) rows.push(row); row = []; field = ''; if (char === '\r' && text[index + 1] === '\n') index++; }
    else field += char;
  }
  if (quoted) throw new Error('A quoted CSV field is not closed. Check the file and try again.');
  row.push(field); if (row.some(value => value.trim())) rows.push(row);
  return rows;
}
