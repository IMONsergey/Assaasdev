import { Icon } from './ui';
import { asset } from '../config';

const marks = [
  { match: /\bnginx\b/i, file: 'nginx.svg', name: 'NGINX' },
  { match: /\bapache\b|\bhttpd\b/i, file: 'apache.svg', name: 'Apache' },
  { match: /\bpostgres(?:ql)?\b/i, file: 'postgresql.png', name: 'PostgreSQL' },
];

/** A verified product mark when recognized, a neutral technology glyph otherwise. */
export function TechnologyMark({ name, size = 22 }: { name?: string; size?: number }) {
  const mark = marks.find(item => item.match.test(name || ''));
  return mark ? <img className="technology-mark" src={asset(`technologies/${mark.file}`)} alt="" aria-hidden="true" width={size} height={size} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} /> : <Icon name="package" size={size} />;
}
