import { asset } from '../config';
import { countryCodes } from './country-codes';

let names: Map<string, string> | undefined;
function regionForName(name?: string) {
  if (!name) return undefined;
  if (!names) {
    names = new Map();
    const display = new Intl.DisplayNames(['en'], { type: 'region' });
    for (const code of countryCodes) {
      const label = display.of(code);
      if (label && label !== code && code !== 'ZZ') names.set(label.toLocaleLowerCase(), code);
    }
  }
  return names.get(name.toLocaleLowerCase());
}
export function CountryFlag({ code, name, className = '' }: { code?: string; name?: string; className?: string }) {
  let region: string | undefined;
  try {
    region = (code || regionForName(name))?.toUpperCase();
    if (!region || !countryCodes.has(region)) return null;
    const label = new Intl.DisplayNames(['en'], { type: 'region' }).of(region);
    if (!label || label === region || region === 'ZZ') return null;
  } catch { return null; }
  return <img className={`country-flag ${className}`} src={asset(`flags/${region.toLowerCase()}.svg`)} width={20} height={15} loading="lazy" decoding="async" alt="" aria-hidden="true" />;
}
