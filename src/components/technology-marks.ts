export type MarkKind = 'technology' | 'provider' | 'os';
export interface TechnologyAsset { key: string; file: string; color?: string; vector?: boolean; }
type Entry = TechnologyAsset & { match: RegExp; kinds: MarkKind[] };

// Match observed names only. In particular, a service port never implies a brand.
const entries: Entry[] = [
  { key: 'tomcat', match: /\b(?:apache[ _-]*)?tomcat\b/i, kinds: ['technology'], file: 'apachetomcat', color: '#f8dc75' },
  { key: 'nginx', match: /\bnginx\b/i, kinds: ['technology', 'provider'], file: 'nginx.svg' },
  { key: 'apache', match: /\bapache\b|\bhttpd\b/i, kinds: ['technology', 'provider'], file: 'apache.svg' },
  { key: 'postgresql', match: /\bpostgres(?:ql)?\b/i, kinds: ['technology'], file: 'postgresql.png' },
  { key: 'caddy', match: /\bcaddy\b/i, kinds: ['technology'], file: 'caddy', color: '#1f88c0' },
  { key: 'mariadb', match: /\bmaria[ _-]?db\b/i, kinds: ['technology'], file: 'mariadb' },
  { key: 'mysql', match: /\bmy[ _-]?sql\b/i, kinds: ['technology'], file: 'mysql', color: '#4479a1' },
  { key: 'mongodb', match: /\bmongo(?:[ _-]?db)?\b/i, kinds: ['technology'], file: 'mongodb', color: '#47a248' },
  { key: 'redis', match: /\bredis\b/i, kinds: ['technology'], file: 'redis', color: '#ff4438' },
  { key: 'elasticsearch', match: /\belastic[ _-]?search\b/i, kinds: ['technology'], file: 'elasticsearch', color: '#005571' },
  { key: 'rabbitmq', match: /\brabbit[ _-]?mq\b/i, kinds: ['technology'], file: 'rabbitmq', color: '#ff6600' },
  { key: 'docker', match: /\bdocker\b/i, kinds: ['technology'], file: 'docker', color: '#2496ed' },
  { key: 'kubernetes', match: /\bkubernetes\b|\bk8s\b/i, kinds: ['technology'], file: 'kubernetes', color: '#326ce5' },
  { key: 'grafana', match: /\bgrafana\b/i, kinds: ['technology'], file: 'grafana', color: '#f46800' },
  { key: 'gitlab', match: /\bgit[ _-]?lab\b/i, kinds: ['technology'], file: 'gitlab', color: '#fc6d26' },
  { key: 'wordpress', match: /\bword[ _-]?press\b/i, kinds: ['technology'], file: 'wordpress', color: '#21759b' },
  { key: 'php', match: /\bphp\b/i, kinds: ['technology'], file: 'php', color: '#777bb4' },
  { key: 'nodejs', match: /\bnode(?:[ ._-]?js)\b/i, kinds: ['technology'], file: 'nodedotjs', color: '#5fa04e' },
  { key: 'python', match: /\bpython\b/i, kinds: ['technology'], file: 'python', color: '#3776ab' },
  { key: 'openssl', match: /\bopen[ _-]?ssl\b/i, kinds: ['technology'], file: 'openssl' },
  { key: 'openvpn', match: /\bopen[ _-]?vpn\b/i, kinds: ['technology'], file: 'openvpn', color: '#ea7e20' },
  { key: 'cisco', match: /\bcisco\b/i, kinds: ['technology', 'provider'], file: 'cisco', color: '#1ba0d7' },
  { key: 'ubuntu', match: /\bubuntu\b/i, kinds: ['technology', 'os'], file: 'ubuntu', color: '#e95420' },
  { key: 'debian', match: /\bdebian\b/i, kinds: ['technology', 'os'], file: 'debian', color: '#a81d33' },
  { key: 'alpine', match: /\balpine(?:[ _-]?linux)?\b/i, kinds: ['technology', 'os'], file: 'alpinelinux', color: '#0d597f' },
  { key: 'freebsd', match: /\bfree[ _-]?bsd\b/i, kinds: ['technology', 'os'], file: 'freebsd', color: '#ab2b28' },
  { key: 'centos', match: /\bcentos\b/i, kinds: ['technology', 'os'], file: 'centos', color: '#262577' },
  { key: 'redhat', match: /\bred[ _-]?hat\b|\brhel\b/i, kinds: ['technology', 'provider', 'os'], file: 'redhat', color: '#ee0000' },
  { key: 'fedora', match: /\bfedora\b/i, kinds: ['technology', 'os'], file: 'fedora', color: '#51a2da' },
  { key: 'linux', match: /\blinux\b/i, kinds: ['technology', 'os'], file: 'linux' },
  { key: 'cloudflare', match: /\bcloudflare\b/i, kinds: ['provider', 'technology'], file: 'cloudflare', color: '#f38020' },
  { key: 'googlecloudstorage', match: /\bgoogle[ _-]?cloud[ _-]?storage\b/i, kinds: ['technology'], file: 'googlecloudstorage', color: '#aecbfa' },
  { key: 'googlecloud', match: /\bgoogle[ _-]?cloud\b|\bgcp\b/i, kinds: ['provider', 'technology'], file: 'googlecloud', color: '#4285f4' },
  { key: 'google', match: /\bgoogle\b/i, kinds: ['provider'], file: 'google', color: '#4285f4' },
  { key: 'digitalocean', match: /\bdigital[ _-]?ocean\b/i, kinds: ['provider'], file: 'digitalocean', color: '#0080ff' },
  { key: 'hetzner', match: /\bhetzner\b/i, kinds: ['provider'], file: 'hetzner', color: '#d50c2d' },
  { key: 'akamai', match: /\bakamai\b/i, kinds: ['provider'], file: 'akamai', color: '#0096d6' },
];

export function technologyAsset(name: string | undefined, kind: MarkKind = 'technology'): TechnologyAsset | undefined {
  if (!name) return undefined;
  const match = entries.find(entry => entry.kinds.includes(kind) && entry.match.test(name.replace(/_/g, ' ')));
  if (!match) return undefined;
  return { key: match.key, file: match.file.includes('.') ? match.file : `marks/${match.file}.svg`, color: match.color, vector: !match.file.includes('.') };
}

export function protocolGlyph(protocol?: string): string {
  const value = protocol?.trim().toLowerCase() || '';
  if (/^(https|tls|ssl|dtls)$/.test(value)) return 'lock';
  if (/^(http|http2|http3|dns|mdns)$/.test(value)) return 'globe';
  if (/^(ssh|telnet)$/.test(value)) return 'code';
  if (/^(ftp|ftps|sftp|smb|nfs)$/.test(value)) return 'folder';
  if (/^(smtp|smtps|imap|imaps|pop3|pop3s)$/.test(value)) return 'mail';
  if (/^(rdp|vnc)$/.test(value)) return 'desktop';
  if (/^(mysql|postgresql|postgres|mongodb|redis|mssql|mariadb|oracle|cassandra|memcached|elasticsearch)$/.test(value)) return 'database';
  return 'server';
}

export function labelGlyph(label: string): string | undefined {
  if (/\b(?:vulnerab\w*|cve|risk)\b/i.test(label)) return 'alert';
  if (/\bweb\b|\bhttp\w*\b/i.test(label)) return 'globe';
  if (/\b(?:database|storage|data)\b/i.test(label)) return 'database';
  if (/\b(?:admin|login|auth)\b/i.test(label)) return 'shield';
  return undefined;
}
