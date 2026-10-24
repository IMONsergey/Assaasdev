import { useId, type CSSProperties } from 'react';

/** Small, deterministic SVG signal fields. No raster assets or animation loops. */
export function CreditPackCover({ level }: { level: number }) {
  const id = useId().replace(/:/g, '');
  const points = Array.from({ length: 7 + level * 2 }, (_, index) => ({ x: 36 + ((index * 47 + level * 19) % 232), y: 17 + ((index * 31 + level * 11) % 75) }));
  return <div className={`credit-pack-cover credit-pack-cover--${level}`} aria-hidden="true">
    <svg viewBox="0 0 304 112" fill="none" focusable="false">
      <defs><pattern id={`grid-${id}`} width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="currentColor" opacity=".18" /></pattern></defs>
      <rect width="304" height="112" fill={`url(#grid-${id})`} />
      <path className="pack-signal-line" d={`M0 77H${25 + level * 7}L${55 + level * 3} 45H111L133 66H176L198 ${32 + level * 4}H245L268 53H304`} stroke="currentColor" strokeWidth="1.2" opacity=".38" />
      <g className="pack-signal-nodes">{points.map((point, index) => <g key={index} style={{ '--node-delay': `${index * 25}ms` } as CSSProperties}><rect x={point.x - 2.5} y={point.y - 2.5} width="5" height="5" rx="1" fill="currentColor" opacity={index % 3 === 0 ? '.78' : '.3'} />{index % 4 === 0 && <rect x={point.x - 6.5} y={point.y - 6.5} width="13" height="13" rx="3" stroke="currentColor" opacity=".18" />}</g>)}</g>
      <rect className="pack-focus-box" x={123 - level * 2} y={28 + level} width={58 + level * 4} height={48 - level * 2} rx="5" fill="var(--bg)" fillOpacity=".8" stroke="currentColor" strokeWidth="1.1" />
      <path d="M145 53H157M151 47V59" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M140 40H135V45M162 40H167V45M140 65H135V60M162 65H167V60" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".65" />
    </svg>
  </div>;
}
