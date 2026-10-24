import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import './brand.css';

type Shared = { children: ReactNode; variant?: 'primary' | 'secondary'; icon?: string; className?: string; compact?: boolean; fullWidth?: boolean };
type Props = Shared & (({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>) | ({ href?: never } & ButtonHTMLAttributes<HTMLButtonElement>));

/** Two adjoining branded shapes, one action, one keyboard stop. */
export function DoubleButton({ children, variant = 'primary', icon = 'arrow', className = '', compact = false, fullWidth = false, ...rest }: Props) {
  const classes = `double-button double-button--${variant}${compact ? ' double-button--compact' : ''}${fullWidth ? ' double-button--full' : ''} ${className}`.trim();
  const content = <><span className="double-button__label">{children}</span><span className="double-button__icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon === 'external' ? <path d="M7 17 17 7M7 7h10v10" /> : icon === 'plus' ? <path d="M12 5v14M5 12h14" /> : <path d="M5 12h14m-6-6 6 6-6 6" />}</svg></span></>;
  if ('href' in rest && rest.href) return <a {...rest as AnchorHTMLAttributes<HTMLAnchorElement>} className={classes}>{content}</a>;
  return <button type="button" {...rest as ButtonHTMLAttributes<HTMLButtonElement>} className={classes}>{content}</button>;
}
