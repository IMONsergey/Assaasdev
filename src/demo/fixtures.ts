import type {
  BillingPayment, BucketFile, HostCard, HostDetail, NotificationsData, PlanningTask,
  PortRecord, PricingData, PrivateTask, Profile, SavedQuery, SessionData,
  TrackedAddress, AddressTransaction,
} from '../api';

/** Deliberately synthetic documentation-address fixtures; no real scan targets. */
export const DEMO_TIMESTAMP = Math.floor(Date.UTC(2026, 9, 23, 12) / 1_000);
export const DEFAULT_SCAN_PORTS = [22, 21, 80, 443, 3306, 5601, 8080, 8443, 9200, 27017];
export const DEMO_CODE = '123456';
export const DEMO_BACKUP_CODES = ['DEMO0001', 'DEMO0002', 'DEMO0003', 'DEMO0004', 'DEMO0005'];
/** This intentionally invalid address cannot receive a payment on any network. */
export const DEMO_PAYMENT_ADDRESS = 'DEMO_ONLY_NOT_A_PAYMENT_ADDRESS';

export interface DemoHost { card: HostCard; detail: HostDetail; taskId: string; host: string }
export interface DemoBucket extends BucketFile { product_name: string }

export function seedHosts(): DemoHost[] {
  const addresses = ['192.0.2.10', '198.51.100.24', '203.0.113.42', '192.0.2.18', '198.51.100.58', '203.0.113.78', '192.0.2.144', '198.51.100.202', '2001:db8::10', '2001:db8::24', 'edge.example.com', 'research.example.org'];
  const countries = [['Germany', 'DE', 'Berlin'], ['United States', 'US', 'Boston'], ['Netherlands', 'NL', 'Amsterdam'], ['United Kingdom', 'GB', 'London']];
  return addresses.map((ip, index) => {
    const [country_name, country_code, city_name] = countries[index % countries.length];
    const host = index >= 10 ? ip : `node-${index + 1}.example.com`;
    // Two detail fixtures exercise client-side pagination/virtualization at 100 and 1000 services.
    const count = index === 0 ? 100 : index === 1 ? 1000 : index % 3 + 2;
    const ports: PortRecord[] = Array.from({ length: count }, (_, position) => {
      const port = position === 0 ? 443 : position === 1 ? 80 : position === 2 ? 22 : 10_000 + position;
      const protocol = port === 22 ? 'ssh' : port === 80 ? 'http' : 'https';
      const product = index % 3 === 0 ? 'nginx' : index % 3 === 1 ? 'Apache httpd' : 'Caddy';
      return {
        port, protocol, transport: 'tcp', status: 'open', uts: DEMO_TIMESTAMP - index * 3600 - position,
        title: `${position === 0 ? 'Research portal' : 'Documentation service'} · ${host}`,
        status_code: port === 22 ? undefined : position % 7 === 6 ? 404 : 200,
        banner: port === 22 ? 'SSH-2.0-OpenSSH_9.6' : `HTTP/1.1 200 OK\r\nServer: ${product}`,
        body: port === 22 ? '' : `<html><title>Service ${position + 1}</title><body>Service response for ${host}</body></html>`,
        headers: { server: [product], 'content-type': ['text/html; charset=utf-8'] },
        cert_domains: [host], header_domains: ['assets.example.com'], redirects: position % 5 === 0 ? ['https://example.com/docs'] : [],
        link: `https://${host}/`,
        tls_info: { server_name: host, tls_version: 'TLS 1.3', cipher_suite: 'TLS_AES_128_GCM_SHA256', issuer: 'CN=Example Certificate Authority', subject: `CN=${host}`, is_ca: false, not_before: '2026-10-01T00:00:00Z', not_after: '2027-01-01T00:00:00Z', dns_names: [host], ext_key_usage: [1] },
        security_txt: { is_security_txt: true, body: 'Contact: mailto:security@example.com', contacts: ['mailto:security@example.com'], url: `https://${host}/.well-known/security.txt`, endpoint: '/.well-known/security.txt' },
        robots_txt: { status_code: 200, body: 'User-agent: *\nDisallow: /internal/' },
        detected_products: [{ product, version: '1.0', vendor: index % 3 === 0 ? 'nginx' : 'Example vendor', labels: ['web'], cve_list: [], exposed_data: index === 0 && position === 0 ? { field_headers: ['email'], field_value: [['research@example.com']] } : undefined }],
      };
    });
    const card: HostCard = {
      ip, os: index % 2 ? 'Linux' : undefined, org: ['Example Research Network', 'Documentation Cloud', 'Edge Systems'][index % 3],
      city_name, country_code, region: index % 2 ? 'Example region' : '',
      uts: DEMO_TIMESTAMP - index * 3600, labels_list: index % 3 === 0 ? ['web', 'vulnerability'] : ['web'],
      open_ports: ports.map((port) => ({ protocol: port.protocol, port: port.port! })),
    };
    return {
      card, host, taskId: `scan_${String(index % 3 + 1).padStart(3, '0')}`,
      detail: { ...card, as_cidr: index < 8 ? `${ip.split('.').slice(0, 3).join('.')}.0/24` : undefined, type: index >= 10 ? 'domain' : index >= 8 ? 'ipv6' : 'ipv4', country_name, continent_name: country_code === 'US' ? 'North America' : 'Europe', asn: 64496 + index, cts: DEMO_TIMESTAMP - 86400 * 7, ports },
    };
  });
}

export function seedProfile(): Profile {
  return {
    session_id: 'session_current', authenticated_at: DEMO_TIMESTAMP, issued_at: DEMO_TIMESTAMP,
    expires_at: DEMO_TIMESTAMP + 86400 * 100, user_id: 'usr_01', user_name: 'alex_research', email: 'alex@example.com', user_type: 'USER',
    balance: 120, credits: 1_240_500, scan_credits: 327_680, purchased_credits: 0,
    subscription: { type: 'Business', start_date: DEMO_TIMESTAMP - 86400 * 4, expiry_date: DEMO_TIMESTAMP + 86400 * 26, credits: 1_500_000, scan_credits: 327_680, search_pages: 300, api_access: true, price: 900, payment_required: true, duration: 2_592_000_000_000_000, canceled: false },
    api_key: '00000000-0000-4000-8000-000000000001', totp_active: false, is_paddle_client: false,
    addresses: [{ network: 'demo-network', coin: 'DEMO', address: DEMO_PAYMENT_ADDRESS }],
    analytics_facets: [{ key: 'type', enabled: true, priority: 0 }, { key: 'country_name', enabled: true, priority: 1 }, { key: 'org', enabled: true, priority: 2 }, { key: 'port', enabled: true, priority: 3 }, { key: 'protocol', enabled: true, priority: 4 }],
    team: { team_owner_id: 'usr_01', team_owner_name: 'alex_research', team_owner_email: 'alex@example.com', team_members: [{ user_id: 'usr_member_001', user_name: 'maya_analysis', email: 'maya@example.com', added_at: DEMO_TIMESTAMP - 86400 * 2 }, { user_id: 'usr_member_002', user_name: 'sam_security', email: 'sam@example.org', added_at: DEMO_TIMESTAMP - 86400 }] },
  };
}

export function seedTasks(): PrivateTask[] {
  return [
    { id: 'scan_001', status: 'completed', created_at: DEMO_TIMESTAMP - 10800, start_time: DEMO_TIMESTAMP - 10790, end_time: DEMO_TIMESTAMP - 10200, schedule: '', done_task_count: 30, task_count: 30, host_list: ['192.0.2.10'], cidr_list: ['203.0.113.0/28'], port_list: [80, 443], result_count: 4, has_results: true },
    { id: 'scan_002', status: 'running', created_at: DEMO_TIMESTAMP - 900, start_time: DEMO_TIMESTAMP - 890, end_time: 0, schedule: '', done_task_count: 4, task_count: 10, host_list: ['198.51.100.24'], cidr_list: [], port_list: DEFAULT_SCAN_PORTS, result_count: 4, has_results: true },
    { id: 'scan_003', status: 'completed', created_at: DEMO_TIMESTAMP - 86400, start_time: DEMO_TIMESTAMP - 86390, end_time: DEMO_TIMESTAMP - 86000, schedule: '0 0 3 * * *', done_task_count: 20, task_count: 20, host_list: ['203.0.113.42', '203.0.113.78'], cidr_list: [], port_list: DEFAULT_SCAN_PORTS, result_count: 4, has_results: true },
  ];
}
export function seedPlanning(): PlanningTask[] {
  return [{ id: 'schedule_001', workers: 500, user_name: 'alex_research', schedule: '0 0 3 * * *', host_list: ['203.0.113.42', '203.0.113.78'], cidr_list: [], port_list: DEFAULT_SCAN_PORTS }];
}
export function seedBuckets(): DemoBucket[] {
  const names = ['reports/2026/summary.csv', 'docs/readme.txt', 'assets/architecture.json', 'exports/hosts.ndjson', 'archive/backup.sql', 'images/diagram.svg', 'logs/empty.log', 'research/findings.csv'];
  return names.map((key, index) => ({
    host: index % 3 === 0 ? 'storage.example.com' : index % 3 === 1 ? 'files.example.org' : 'data.example.net',
    container: index % 3 === 0 ? 'public' : undefined, protocol: 'https', key, extension: key.split('.').at(-1),
    alphabets: ['latin'], alias_hosts: [], cts: DEMO_TIMESTAMP - 86400 * (index + 1), uts: DEMO_TIMESTAMP - 3600 * index,
    size_mb: [1.2, 0.01, 2.5, 15.8, 48.3, 0.12, 0, 3.7][index], product_name: index % 3 === 0 ? 'azureblobstorage' : index % 3 === 1 ? 'amazons3' : 'googlecloudstorage',
  }));
}
export function seedSavedQueries(): SavedQuery[] {
  return [
    { id: '000000000000000000000001', query: JSON.stringify({ full_text_search: 'nginx', page: 1, docs_per_page: 20, sort_field: 'uts', sort_direction: 'desc' }), created_at: DEMO_TIMESTAMP - 7200, updated_at: DEMO_TIMESTAMP - 7200 },
    { id: '000000000000000000000002', query: JSON.stringify({ simple_search_filters: [{ field: 'country_name', value: 'Germany' }, { field: 'port', value: '443' }], page: 1, docs_per_page: 20 }), created_at: DEMO_TIMESTAMP - 3600, updated_at: DEMO_TIMESTAMP - 3600 },
    { id: '000000000000000000000003', query: JSON.stringify({ task_ids: ['scan_001'], page: 1, docs_per_page: 20 }), created_at: DEMO_TIMESTAMP - 1800, updated_at: DEMO_TIMESTAMP - 1800 },
  ];
}
export function seedPricing(): PricingData {
  return {
    timestamp: DEMO_TIMESTAMP,
    subscriptions: [
      { type: 'Free', name: 'Free', monthly_price: 0, annually_price: 0, credits: 500, scan_credits: 0, search_pages: 2, users: 1, duration: '30d', api_access: false, cve: false, buckets: false, leak_data: false, bulk_data: false, private_scanning: false, support: 'community' },
      { type: 'Plus', name: 'Plus', monthly_price: 50, annually_price: 480, credits: 25000, scan_credits: 0, search_pages: 25, users: 1, duration: '30d', api_access: true, cve: true, buckets: true, leak_data: false, bulk_data: false, private_scanning: false, support: 'email' },
      { type: 'Expert', name: 'Expert', monthly_price: 300, annually_price: 2880, credits: 250000, scan_credits: 0, search_pages: 150, users: 1, duration: '30d', api_access: true, cve: true, buckets: true, leak_data: true, bulk_data: false, private_scanning: false, support: 'priority' },
      { type: 'Business', name: 'Business', monthly_price: 900, annually_price: 8640, credits: 1500000, scan_credits: 327680, search_pages: 300, users: 10, duration: '30d', api_access: true, cve: true, buckets: true, leak_data: true, bulk_data: true, private_scanning: true, support: 'priority' },
    ],
    tokens: [{ id: 'token_pack_1', name: 'Starter Pack', product_name: 'Search credits', tokens: 25000, price_usd: 50, discount_percent: 0, price_per_token: 0.002, description: 'Additional search credits.' }, { id: 'token_pack_2', name: 'Research Pack', product_name: 'Search credits', tokens: 100000, price_usd: 180, discount_percent: 10, price_per_token: 0.0018 }],
  };
}
export function seedSessions(): SessionData {
  return { total: 3, limit: 10, sessions: [
    { session_id: 'session_current', ip_address: '192.0.2.100', user_agent: 'Chrome', device_info: 'Desktop', browser: 'Chrome', os: 'macOS', location: 'Amsterdam, Netherlands', last_activity: DEMO_TIMESTAMP, is_active: true, is_current: true, created_at: DEMO_TIMESTAMP - 7200, authenticated_at: DEMO_TIMESTAMP - 7200 },
    { session_id: 'session_mobile', ip_address: '198.51.100.100', device_info: 'Mobile', browser: 'Safari', os: 'iOS', location: 'Amsterdam, Netherlands', last_activity: DEMO_TIMESTAMP - 900, is_active: true, is_current: false, created_at: DEMO_TIMESTAMP - 86400 },
    { session_id: 'session_desktop', ip_address: '203.0.113.100', device_info: 'Desktop', browser: 'Firefox', os: 'Windows', location: 'Berlin, Germany', last_activity: DEMO_TIMESTAMP - 3600, is_active: false, is_current: false, created_at: DEMO_TIMESTAMP - 86400 * 2 },
  ] };
}
export function seedNotifications(): NotificationsData {
  return { total: 3, unread_count: 2, timestamp: DEMO_TIMESTAMP, notifications: [
    { id: 'notification_001', notification_type: 'team_member_added', message: 'Maya joined your organization.', payload: { owner_name: 'alex_research' }, is_read: false, created_at: DEMO_TIMESTAMP - 600 },
    { id: 'notification_002', notification_type: 'subscription_expiring', message: 'Your Business subscription is approaching its renewal date.', payload: {}, is_read: false, created_at: DEMO_TIMESTAMP - 3600 },
    { id: 'notification_003', notification_type: 'subscription_activated', message: 'Your Business plan is active.', payload: {}, is_read: true, created_at: DEMO_TIMESTAMP - 86400 * 4 },
  ] };
}
export function seedPayments(): BillingPayment[] {
  return [{ payment_id: 'pay_001', subscription: 'Plus', amount: 50, amount_usd: 50, status: 'pending', network: 'demo-network', coin: 'DEMO', address: DEMO_PAYMENT_ADDRESS, created_at: DEMO_TIMESTAMP, updated_at: DEMO_TIMESTAMP, expires_at: DEMO_TIMESTAMP + 3600 }];
}

/** Read-only precision fixtures. They do not settle an invoice or grant entitlement. */
export function seedTrackedAddresses(): TrackedAddress[] {
  return [{ network: 'demo-network', coin: 'DEMO', address: DEMO_PAYMENT_ADDRESS, is_active: false,
    last_checked_at: DEMO_TIMESTAMP, last_tx_timestamp: DEMO_TIMESTAMP - 3600,
    total_received: '900719925474099312345678901', total_received_readable: '900719925.474099312345678901' }];
}
export function seedAddressTransactions(): AddressTransaction[] {
  return [{ tx_hash: 'DEMO_TX_NOT_ON_CHAIN_001', from_address: 'DEMO_ONLY_NOT_A_SENDER_ADDRESS',
    amount: '900719925474099312345678901', decimals: 18, block_number: '9007199254740993',
    timestamp: DEMO_TIMESTAMP - 3600, status: 'received', created_at: DEMO_TIMESTAMP - 3590 }];
}
