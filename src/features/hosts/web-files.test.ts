import { describe, expect, it } from 'vitest';
import { robotsSummary, securitySummary } from './web-files';
import { serviceItems } from './model';
import type { PortRecord } from '../../api';

describe('received web file summaries', () => {
  it('extracts contacts and policy from body-only security.txt without claiming validation', () => {
    const facts = Object.fromEntries(securitySummary({ body: '\uFEFF# Example policy\r\ncontact: mailto:security@example.com\r\nContact: https://example.com/report#security\r\nExpires: 2027-10-01T00:00:00Z\r\nPreferred-Languages: en, de\r\nPolicy: https://example.com/policy' }));
    expect(facts.Contacts).toEqual(['mailto:security@example.com', 'https://example.com/report#security']);
    expect(facts['Preferred languages']).toEqual(['en', 'de']);
    expect(facts.Policy).toEqual(['https://example.com/policy']);
    expect(facts['Recognized by scanner']).toBeUndefined();
    expect(facts['Observed URL']).toBeUndefined();
  });
  it('preserves scanner values, deduplicates contacts and ignores signature payload', () => {
    const facts = Object.fromEntries(securitySummary({ is_security_txt: false, contacts: ['mailto:security@example.com'], body: '-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA512\n\nContact: mailto:security@example.com\n-----BEGIN PGP SIGNATURE-----\nContact: mailto:signature@example.com' }));
    expect(facts['Recognized by scanner']).toBe(false);
    expect(facts.Contacts).toEqual(['mailto:security@example.com']);
    expect(securitySummary(undefined)).toEqual([]);
    expect(securitySummary({ body: '<html>No file</html>' })).toEqual([]);
  });
  it('summarizes robots groups without implying every path applies to every user agent', () => {
    const facts = Object.fromEntries(robotsSummary({ status_code: 200, body: 'User-agent: *\nAllow: /docs/ # comment\nDisallow:\nDisallow: /internal/\n\nUser-agent: ExampleBot\nDisallow: /archive/\nSitemap: https://example.com/sitemap.xml' }));
    expect(facts).toEqual({ 'HTTP status': 200, 'User agents': ['*', 'ExampleBot'], 'Allow rules': 1, 'Disallow rules': 2, Sitemaps: ['https://example.com/sitemap.xml'] });
  });
  it('isolates malformed summary metadata while retaining the raw record and body', () => {
    const record = { port: 443, security_txt: { is_security_txt: 'true', contacts: ['mailto:security@example.com', null], body: 'Contact: mailto:security@example.com' }, robots_txt: { status_code: '200', body: 'User-agent: *' } } as unknown as PortRecord;
    const [item] = serviceItems([record]);
    expect(item.invalidFields).toEqual(['security_txt.is_security_txt', 'security_txt.contacts', 'robots_txt.status_code']);
    expect(item.rawRecord).toBe(record);
    expect(Object.fromEntries(securitySummary(item.record.security_txt)).Contacts).toEqual(['mailto:security@example.com']);
  });
});
