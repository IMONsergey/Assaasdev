import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { asset } from '../config';
import { lockPageScroll } from '../lib/scroll-lock';

const join = (...names: (string | undefined | false)[]) => names.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', loading, fullWidth, className, children, disabled, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost'; size?: 'sm' | 'md'; loading?: boolean; fullWidth?: boolean }) {
  return <button type={type} className={join('button', `button--${variant}`, `button--${size}`, fullWidth && 'button--full', className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading && <span className="spinner spinner--small" aria-hidden="true" />}{children}</button>;
}

type FieldMeta = { label: ReactNode; hint?: ReactNode; error?: ReactNode; icon?: ReactNode };
export function Field({ label, hint, error, icon, id: explicit, className, ...props }: InputHTMLAttributes<HTMLInputElement> & FieldMeta) {
  const generated = useId(), id = explicit ?? generated;
  return <div className={join('field', className)}><label htmlFor={id}>{label}</label><div className={join('field-control', !!icon && 'field-control--icon')}>{icon}<input id={id} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...props} /></div>{error ? <span id={`${id}-error`} className="field-error" role="alert">{error}</span> : hint ? <span id={`${id}-hint`} className="field-hint">{hint}</span> : null}</div>;
}
export function TextArea({ label, hint, error, id: explicit, className, icon: _icon, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldMeta) {
  const generated = useId(), id = explicit ?? generated;
  return <div className={join('field', className)}><label htmlFor={id}>{label}</label><textarea id={id} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...props} />{error ? <span id={`${id}-error`} className="field-error" role="alert">{error}</span> : hint ? <span id={`${id}-hint`} className="field-hint">{hint}</span> : null}</div>;
}
export function SelectField({ label, hint, error, id: explicit, className, children, icon: _icon, ...props }: SelectHTMLAttributes<HTMLSelectElement> & FieldMeta) {
  const generated = useId(), id = explicit ?? generated;
  return <div className={join('field', className)}><label htmlFor={id}>{label}</label><select id={id} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...props}>{children}</select>{error ? <span id={`${id}-error`} className="field-error" role="alert">{error}</span> : hint ? <span id={`${id}-hint`} className="field-hint">{hint}</span> : null}</div>;
}
export function Checkbox({ label, hint, id: explicit, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  const generated = useId(), id = explicit ?? generated;
  return <div className={join('checkbox-field', className)}><input {...props} type="checkbox" id={id} aria-describedby={hint ? `${id}-hint` : undefined} /><div><label htmlFor={id}>{label}</label>{hint && <div id={`${id}-hint`} className="field-hint">{hint}</div>}</div></div>;
}
export function PageHeader({ title, eyebrow, description, actions }: { title: ReactNode; eyebrow?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="page-heading-actions">{actions}</div>}</header>;
}
export function Card({ children, className }: { children: ReactNode; className?: string }) { return <section className={join('card', className)}>{children}</section>; }
export function Alert({ tone = 'info', title, children, actions }: { tone?: 'error' | 'warning' | 'success' | 'info'; title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}><div>{title && <strong className="alert-title">{title}</strong>}<div>{children}</div></div>{actions && <div className="alert-actions">{actions}</div>}</div>;
}
export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'error'; children: ReactNode }) { return <span className={`badge badge--${tone}`}>{children}</span>; }
export function Spinner({ label = 'Loading…' }: { label?: string }) { return <span className="loading-state" role="status"><span className="spinner" aria-hidden="true" />{label}</span>; }
export function Dialog({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) { if (dialog.open) dialog.close(); return; }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockPageScroll();
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      unlock();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);
  return createPortal(<dialog ref={ref} className={`dialog dialog--${size}`} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }}><header className="dialog-header"><h2 id={titleId}>{title}</h2><Button variant="ghost" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></Button></header><div className="dialog-body">{children}</div>{footer && <footer className="dialog-footer">{footer}</footer>}</dialog>, document.body);
}
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', danger, busy, confirmDisabled }: { open: boolean; onClose: () => void; onConfirm: () => void | Promise<void>; title: ReactNode; description: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; confirmDisabled?: boolean }) {
  return <Dialog open={open} onClose={() => { if (!busy) onClose(); }} title={title} size="sm" footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={confirmDisabled} onClick={() => void onConfirm()}>{confirmLabel}</Button></>}><div className="confirm-description">{description}</div></Dialog>;
}
export function EmptyState({ title, description, icon, actions }: { title: ReactNode; description?: ReactNode; icon?: ReactNode; actions?: ReactNode }) { return <div className="empty-state">{icon && <div className="empty-state-icon">{icon}</div>}<h2>{title}</h2>{description && <p>{description}</p>}{actions && <div className="cluster">{actions}</div>}</div>; }
export function Tabs({ items, value, onChange }: { items: { id: string; label: ReactNode; count?: number }[]; value: string; onChange: (id: string) => void }) {
  return <div className="tabs" role="tablist" onKeyDown={e => { const index = items.findIndex(item => item.id === value); const next = e.key === 'ArrowRight' ? (index + 1) % items.length : e.key === 'ArrowLeft' ? (index + items.length - 1) % items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1; if (next >= 0) { e.preventDefault(); onChange(items[next].id); (e.currentTarget.children[next] as HTMLElement).focus(); } }}>{items.map(item => <button key={item.id} type="button" role="tab" aria-selected={value === item.id} tabIndex={value === item.id ? 0 : -1} onClick={() => onChange(item.id)}>{item.label}{item.count !== undefined && <span className="tab-count">{item.count}</span>}</button>)}</div>;
}
export function Pagination({ page, pageSize, count, total, maxPage, disabled = false, onPageChange }: { page: number; pageSize: number; count: number; total?: number; maxPage?: number; disabled?: boolean; onPageChange: (page: number) => void }) {
  const hasNext = (total === undefined ? count === pageSize : page * pageSize < total) && (maxPage === undefined || page < maxPage);
  return <nav className="pagination" aria-label="Pagination" aria-busy={disabled || undefined}><p className="muted" aria-live="polite" aria-atomic="true">{total !== undefined ? `${total.toLocaleString()} results · ` : ''}Page {page}{maxPage && page >= maxPage ? ' · Plan limit reached' : ''}</p><div className="cluster"><Button variant="secondary" size="sm" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}><Icon name="chevron-left" size={16} />Previous</Button><Button variant="secondary" size="sm" disabled={disabled || !hasNext} onClick={() => onPageChange(page + 1)}>Next<Icon name="chevron-right" size={16} /></Button></div></nav>;
}

const figmaIcons: Record<string, string> = { search: 'home/imgIconSearch.svg', database: 'home/imgIconDatabase.svg', files: 'home/imgIconDatabase.svg', scan: 'home/imgIconScan.svg', code: 'home/imgIconCode.svg', api: 'home/imgIconCode.svg', card: 'home/imgIconCard.svg', bell: 'home/imgIconBell.svg', copy: 'results-heading/imgIconCopy.svg', download: 'results-heading/imgIconDownload.svg', external: 'host/imgIconExternal.svg' };
const tablerIcons = new Set(['settings', 'help-circle', 'bookmark', 'chevrons-left', 'chevrons-right']);
const paths: Record<string, ReactNode> = {
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>, close: <path d="m6 6 12 12M6 18 18 6" />,
  'chevron-left': <path d="m14 5-7 7 7 7" />, 'chevron-right': <path d="m10 5 7 7-7 7" />, 'chevron-down': <path d="m5 9 7 7 7-7" />,
  plus: <path d="M12 5v14M5 12h14" />, arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  moon: <path d="M20 14.3A8.5 8.5 0 0 1 9.7 4a8.5 8.5 0 1 0 10.3 10.3Z" />,
  refresh: <><path d="M20 4v5h-5M4 20v-5h5" /><path d="M5.5 8a7 7 0 0 1 12-2L20 9M4 15l2.5 3a7 7 0 0 0 12-2" /></>,
  filter: <path d="M4 5h16l-6 7v7l-4-2v-5Z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 4v3" /></>,
  logout: <><path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  list: <path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01" />,
};
export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const iconPath = figmaIcons[name] ? `figma/${figmaIcons[name]}` : tablerIcons.has(name) ? `icons/${name}.svg` : null;
  if (iconPath) return <span className={join('icon icon--asset', className)} style={{ width: size, height: size, maskImage: `url("${asset(iconPath)}")`, WebkitMaskImage: `url("${asset(iconPath)}")` }} aria-hidden="true" />;
  return <svg className={join('icon', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.info}</svg>;
}
