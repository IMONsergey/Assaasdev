import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { protocolGlyph, technologyAsset } from './technology-marks';

describe('observed technology identity', () => {
  it('keeps product, operating-system and provider contexts separate', () => {
    expect(technologyAsset('Apache Tomcat 10.1')?.key).toBe('tomcat');
    expect(technologyAsset('Apache httpd 2.4')?.key).toBe('apache');
    expect(technologyAsset('Ubuntu_Linux 24.04', 'os')?.key).toBe('ubuntu');
    expect(technologyAsset('Cloudflare, Inc.', 'provider')?.key).toBe('cloudflare');
    expect(technologyAsset('Google LLC', 'provider')?.key).toBe('google');
    expect(technologyAsset('Google Cloud Storage')?.key).toBe('googlecloudstorage');
    expect(technologyAsset('Google LLC')).toBeUndefined();
    expect(technologyAsset('Caddy', 'provider')).toBeUndefined();
    expect(technologyAsset('Documentation Cloud', 'provider')).toBeUndefined();
    expect(technologyAsset('443')).toBeUndefined();
    expect(technologyAsset(undefined)).toBeUndefined();
    expect(protocolGlyph('https')).toBe('lock');
    expect(protocolGlyph('ssh')).toBe('code');
    expect(protocolGlyph('unknown-service')).toBe('server');
  });

  it('resolves every recognized local mark to a real vector or image asset', () => {
    const names = ['nginx', 'Apache', 'PostgreSQL', 'Tomcat', 'Caddy', 'MariaDB', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'RabbitMQ', 'Docker', 'Kubernetes', 'Grafana', 'GitLab', 'WordPress', 'PHP', 'Node.js', 'Python', 'OpenSSL', 'OpenVPN', 'Cisco', 'Ubuntu', 'Debian', 'Alpine Linux', 'FreeBSD', 'CentOS', 'Red Hat', 'Fedora', 'Linux', 'Cloudflare', 'Google Cloud Storage', 'Google Cloud'];
    for (const name of names) {
      const mark = technologyAsset(name);
      expect(mark, name).toBeDefined();
      const path = resolve('public/assets/technologies', mark!.file);
      expect(existsSync(path), `${name}: ${path}`).toBe(true);
      if (mark!.vector) {
        const svg = readFileSync(path, 'utf8');
        expect(svg).toContain('<svg');
        expect(svg).toContain('<path');
        expect(svg).not.toMatch(/<script|<foreignObject|https?:\/\/[^\s"]+\.js/);
      }
    }
  });
});
