import { Icon } from './ui';
import { asset } from '../config';
import { protocolGlyph, technologyAsset, type MarkKind } from './technology-marks';
import './technology-marks.css';

/** A verified product mark when recognized, a neutral technology glyph otherwise. */
export function TechnologyMark({ name, size = 22, kind = 'technology', fallback }: { name?: string; size?: number; kind?: MarkKind; fallback?: string }) {
  const mark = technologyAsset(name, kind);
  if (!mark) return <Icon name={fallback || (kind === 'os' ? 'desktop' : kind === 'provider' ? 'server' : 'package')} size={size} />;
  const style = { width: size, height: size, flexShrink: 0 };
  if (mark.vector) return <span className="technology-mark technology-mark--vector" data-technology={mark.key} aria-hidden="true" style={{ ...style, color: mark.color }}><span style={{ maskImage: `url("${asset(`technologies/${mark.file}`)}")`, WebkitMaskImage: `url("${asset(`technologies/${mark.file}`)}")` }} /></span>;
  return <img className="technology-mark" data-technology={mark.key} src={asset(`technologies/${mark.file}`)} alt="" aria-hidden="true" width={size} height={size} style={{ ...style, objectFit: 'contain' }} />;
}

/** Protocols are represented semantically; no product detection is inferred. */
export function ProtocolMark({ protocol, size = 16 }: { protocol?: string; size?: number }) {
  return <Icon name={protocolGlyph(protocol)} size={size} />;
}
