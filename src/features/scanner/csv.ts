/** Local CSV reader: quoted commas, escaped quotes and newlines are preserved. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  // Count separators in the first record, ignoring quoted notes and line breaks.
  // A semicolon inside a quoted CSV field must not change the entire import.
  let commas = 0, semicolons = 0, inQuotes = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') { if (inQuotes && text[index + 1] === '"') index++; else inQuotes = !inQuotes; }
    else if (!inQuotes && (char === '\n' || char === '\r')) break;
    else if (!inQuotes && char === ',') commas++;
    else if (!inQuotes && char === ';') semicolons++;
  }
  const delimiter = semicolons > commas ? ';' : ',';
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

/** Only recognizable column labels are treated as headers; never drop an address by default. */
export function detectTargetColumn(rows: string[][]): { header: boolean; column: number } {
  const labels = new Set(['host', 'hosts', 'hostname', 'hostnames', 'ip', 'ips', 'ipaddress', 'ipaddresses', 'address', 'addresses', 'target', 'targets', 'cidr', 'cidrs', 'cidrblock', 'cidrblocks', 'network', 'networks', 'domain', 'domains']);
  const column = (rows[0] || []).findIndex(value => labels.has(value.trim().toLowerCase().replace(/[\s_/-]+/g, '')));
  return { header: column >= 0, column: Math.max(0, column) };
}
