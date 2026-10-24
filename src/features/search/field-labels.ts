export const CONDITION_FIELDS = [
  { label: 'Network', fields: [['ip', 'IP address'], ['domain', 'Domain'], ['org', 'Organization'], ['asn', 'ASN'], ['country_name', 'Country'], ['country_code', 'Country code'], ['city_name', 'City'], ['os', 'Operating system']] },
  { label: 'Services', fields: [['port', 'Port'], ['protocol', 'Protocol'], ['transport', 'Transport'], ['status_code', 'HTTP status'], ['title', 'Page title'], ['tls_info.server_name', 'TLS server name']] },
  { label: 'Products & signals', fields: [['products', 'Product'], ['vendors', 'Vendor'], ['cve_id', 'CVE'], ['labels', 'Label']] },
];

export const fieldLabels: Record<string, string> = Object.fromEntries(CONDITION_FIELDS.flatMap(group => group.fields));
