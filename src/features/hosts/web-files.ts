import type { PortRecord } from '../../api';

export type WebFileFact = [string, unknown];

/** Read the received plain text; these summaries do not certify file validity. */
function directives(body: string | undefined, robots = false): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (typeof body !== 'string') return result;
  for (let line of body.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)) {
    if (line.trimStart().startsWith('-----BEGIN PGP SIGNATURE-----')) break;
    if (robots) line = line.split('#', 1)[0];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^\s*([a-z][a-z-]*)\s*:\s*(.*?)\s*$/i);
    if (!match || !match[2]) continue;
    const key = match[1].toLowerCase();
    const entries = result.get(key);
    if (entries) entries.push(match[2]); else result.set(key, [match[2]]);
  }
  return result;
}

function append(facts: WebFileFact[], label: string, value: unknown) {
  if (value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length)) facts.push([label, value]);
}

export function securitySummary(file: PortRecord['security_txt']): WebFileFact[] {
  if (!file) return [];
  const values = directives(file.body), facts: WebFileFact[] = [];
  const contacts = [...new Set([...(Array.isArray(file.contacts) ? file.contacts.filter(contact => typeof contact === 'string' && contact.trim()) : []), ...(values.get('contact') || [])])];
  if (typeof file.is_security_txt === 'boolean') append(facts, 'Recognized by scanner', file.is_security_txt);
  append(facts, 'Contacts', contacts);
  append(facts, 'Expires', values.get('expires'));
  append(facts, 'Preferred languages', values.get('preferred-languages')?.flatMap(value => value.split(',').map(language => language.trim()).filter(Boolean)));
  append(facts, 'Policy', values.get('policy'));
  append(facts, 'Canonical URL', values.get('canonical'));
  append(facts, 'Acknowledgments', values.get('acknowledgments'));
  append(facts, 'Encryption', values.get('encryption'));
  append(facts, 'Observed URL', file.url);
  append(facts, 'Endpoint', file.endpoint);
  return facts;
}

export function robotsSummary(file: PortRecord['robots_txt']): WebFileFact[] {
  if (!file) return [];
  const values = directives(file.body, true), facts: WebFileFact[] = [];
  append(facts, 'HTTP status', file.status_code);
  append(facts, 'User agents', [...new Set(values.get('user-agent') || [])]);
  // Rule counts summarize the file without merging paths from different groups.
  if (values.has('user-agent')) {
    append(facts, 'Allow rules', values.get('allow')?.length || 0);
    append(facts, 'Disallow rules', values.get('disallow')?.length || 0);
  }
  append(facts, 'Sitemaps', [...new Set(values.get('sitemap') || [])]);
  return facts;
}
