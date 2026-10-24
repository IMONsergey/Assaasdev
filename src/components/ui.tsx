import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { asset } from '../config';
import { lockPageScroll } from '../lib/scroll-lock';
import { useTabOverflow } from '../lib/tab-overflow';
import { OrbCubeLoader } from './brand';
import { SelectControl } from './form-controls/SelectControl';
import { DateTimeControl } from './form-controls/DateTimeControl';
import { textFromNode } from './form-controls/shared';
import './form-controls/form-controls.css';
export { SelectControl } from './form-controls/SelectControl';
export { ComboBoxField } from './form-controls/ComboBoxField';
export type { ComboBoxOption, ComboBoxFieldProps } from './form-controls/ComboBoxField';

const join = (...names: (string | undefined | false)[]) => names.filter(Boolean).join(' ');

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost'; size?: 'sm' | 'md'; loading?: boolean; fullWidth?: boolean };
export function Button({ variant = 'primary', size = 'md', loading, fullWidth, className, children, disabled, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={join('button', `button--${variant}`, `button--${size}`, fullWidth && 'button--full', className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading && <OrbCubeLoader size={20} decorative color="currentColor" />}{children}</button>;
}

export function FilterButton({ active, count, children = 'Filters', className, ...props }: Omit<ButtonProps, 'variant'> & { active?: boolean; count?: number }) {
  return <Button variant="secondary" className={join('filter-button', active && 'is-active', className)} {...props}><Icon name="filter" size={18} /><span>{children}</span>{typeof count === 'number' && count > 0 && <span className="filter-button-count" aria-label={`${count} active filters`}>{count}</span>}</Button>;
}

type FieldMeta = { label: ReactNode; hint?: ReactNode; error?: ReactNode; icon?: ReactNode };
export function Field({ label, hint, error, icon, id: explicit, className, ...props }: InputHTMLAttributes<HTMLInputElement> & FieldMeta) {
  const generated = useId(), id = explicit ?? generated;
  if (props.type === 'datetime-local' || props.type === 'date') return <div className={join('field', className)}><label htmlFor={id}>{label}</label><DateTimeControl {...props} id={id} labelText={textFromNode(label)} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} />{error ? <span id={`${id}-error`} className="field-error" role="alert">{error}</span> : hint ? <span id={`${id}-hint`} className="field-hint">{hint}</span> : null}</div>;
  return <div className={join('field', className)}><label htmlFor={id}>{label}</label><div className={join('field-control', !!icon && 'field-control--icon')}>{icon}<input id={id} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...props} /></div>{error ? <span id={`${id}-error`} className="field-error" role="alert">{error}</span> : hint ? <span id={`${id}-hint`} className="field-hint">{hint}</span> : null}</div>;
}
export function TextArea({ label, hint, error, id: explicit, className, icon: _icon, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldMeta) {
  const generated = useId(), id = explicit ?? generated;
  return <div className={join('field', className)}><label htmlFor={id}>{label}</label><textarea id={id} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...props} />{error ? <span id={`${id}-error`} className="field-error" role="alert">{error}</span> : hint ? <span id={`${id}-hint`} className="field-hint">{hint}</span> : null}</div>;
}
export function SelectField({ label, hint, error, id: explicit, className, children, icon: _icon, ...props }: SelectHTMLAttributes<HTMLSelectElement> & FieldMeta) {
  const generated = useId(), id = explicit ?? generated;
  return <div className={join('field', className)}><label htmlFor={id}>{label}</label><SelectControl id={id} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...props}>{children}</SelectControl>{error ? <span id={`${id}-error`} className="field-error" role="alert">{error}</span> : hint ? <span id={`${id}-hint`} className="field-hint">{hint}</span> : null}</div>;
}
export function Checkbox({ label, hint, id: explicit, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  const generated = useId(), id = explicit ?? generated;
  return <label className={join('checkbox-field', className)} htmlFor={id}><input {...props} type="checkbox" id={id} aria-describedby={hint ? `${id}-hint` : undefined} /><span className="checkbox-copy"><span className="checkbox-label">{label}</span>{hint && <span id={`${id}-hint`} className="field-hint">{hint}</span>}</span></label>;
}
export function PageHeader({ title, eyebrow, description, actions }: { title: ReactNode; eyebrow?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="page-heading-actions">{actions}</div>}</header>;
}
export function Card({ children, className }: { children: ReactNode; className?: string }) { return <section className={join('card', className)}>{children}</section>; }
export function Alert({ tone = 'info', title, children, actions }: { tone?: 'error' | 'warning' | 'success' | 'info'; title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}><div>{title && <strong className="alert-title">{title}</strong>}<div>{children}</div></div>{actions && <div className="alert-actions">{actions}</div>}</div>;
}
export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'error'; children: ReactNode }) { return <span className={`badge badge--${tone}`}>{children}</span>; }
export function Spinner({ label = 'Loading…' }: { label?: string }) { return <span className="loading-state" role="status"><OrbCubeLoader size={32} decorative />{label}</span>; }
export function Skeleton({ rows = 4, className, label = 'Loading…' }: { rows?: number; className?: string; label?: string }) {
  return <div className={join('skeleton', className)} role="status" aria-label={label} aria-busy="true"><div className="skeleton-status"><OrbCubeLoader size={44} decorative /><span>{label}</span></div><div className="skeleton-heading" aria-hidden="true" /><div className="skeleton-subheading" aria-hidden="true" />{Array.from({ length: rows }, (_, index) => <div className="skeleton-row" key={index} aria-hidden="true"><i /><span><i /><i /></span><i /></div>)}</div>;
}
export function Dialog({ open, onClose, title, children, footer, size = 'md', placement = 'center', scope = 'screen', className }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'; placement?: 'center' | 'left'; scope?: 'screen' | 'workspace'; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  const [bounds, setBounds] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open || scope !== 'workspace') return;
    const main = document.querySelector<HTMLElement>('.workspace-main');
    const header = document.querySelector<HTMLElement>('.app-topbar');
    const sync = () => setBounds({ left: Math.max(0, main?.getBoundingClientRect().left ?? 0), top: Math.max(0, header?.getBoundingClientRect().bottom ?? 0) });
    sync();
    const observer = new ResizeObserver(sync);
    if (main) observer.observe(main);
    if (header) observer.observe(header);
    window.addEventListener('resize', sync);
    return () => { observer.disconnect(); window.removeEventListener('resize', sync); };
  }, [open, scope]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) { if (dialog.open) dialog.close(); return; }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockPageScroll();
    if (!dialog.open) dialog.showModal();
    dialog.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      unlock();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);
  const workspaceStyle = scope === 'workspace' ? { '--dialog-workspace-left': `${bounds.left}px`, '--dialog-workspace-top': `${bounds.top}px` } as CSSProperties : undefined;
  return createPortal(<dialog ref={ref} tabIndex={-1} style={workspaceStyle} className={join('dialog', `dialog--${size}`, placement === 'left' && 'dialog--left', scope === 'workspace' && 'dialog--workspace', className)} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }}><header className="dialog-header"><h2 id={titleId}>{title}</h2><Button variant="ghost" className="dialog-close icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></Button></header><div className="dialog-body">{children}</div>{footer && <footer className="dialog-footer">{footer}</footer>}</dialog>, document.body);
}
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', danger, busy, confirmDisabled, confirmHook }: { open: boolean; onClose: () => void; onConfirm: () => void | Promise<void>; title: ReactNode; description: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; confirmDisabled?: boolean; confirmHook?: string }) {
  return <Dialog open={open} onClose={() => { if (!busy) onClose(); }} title={title} size="sm" footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={confirmDisabled} data-onboarding={confirmHook} onClick={() => void onConfirm()}>{confirmLabel}</Button></>}><div className="confirm-description">{description}</div></Dialog>;
}
export function EmptyState({ title, description, icon, actions }: { title: ReactNode; description?: ReactNode; icon?: ReactNode; actions?: ReactNode }) { return <div className="empty-state">{icon && <div className="empty-state-icon">{icon}</div>}<h2>{title}</h2>{description && <p>{description}</p>}{actions && <div className="cluster">{actions}</div>}</div>; }
export function Tabs({ items, value, onChange, variant = 'line', ariaLabel = 'Sections', idPrefix }: { items: { id: string; label: ReactNode; count?: number; icon?: string }[]; value: string; onChange: (id: string) => void; variant?: 'line' | 'segmented'; ariaLabel?: string; idPrefix?: string }) {
  const { ref, overflow } = useTabOverflow(value);
  return <div ref={ref} data-tab-overflow={overflow} className={`tabs tabs--${variant}`} role="tablist" aria-label={ariaLabel} onKeyDown={e => { const index = items.findIndex(item => item.id === value); const next = e.key === 'ArrowRight' ? (index + 1) % items.length : e.key === 'ArrowLeft' ? (index + items.length - 1) % items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1; if (next >= 0 && items[next]) { e.preventDefault(); onChange(items[next].id); (e.currentTarget.children[next] as HTMLElement).focus({ preventScroll: true }); } }}>{items.map(item => <button key={item.id} id={idPrefix ? `${idPrefix}-tab-${item.id}` : undefined} aria-controls={idPrefix ? `${idPrefix}-panel-${item.id}` : undefined} type="button" role="tab" aria-selected={value === item.id} tabIndex={value === item.id ? 0 : -1} onClick={() => onChange(item.id)}>{item.icon && <Icon name={item.icon} size={17} />}{item.label}{item.count !== undefined && <span className="tab-count">{item.count}</span>}</button>)}</div>;
}
export function TabPanel({ idPrefix, value, children, hidden, className }: { idPrefix: string; value: string; children: ReactNode; hidden?: boolean; className?: string }) {
  return <section id={`${idPrefix}-panel-${value}`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${value}`} hidden={hidden} className={join('tab-panel', className)}>{children}</section>;
}
export function Pagination({ page, pageSize, count, total, maxPage, disabled = false, onPageChange }: { page: number; pageSize: number; count: number; total?: number; maxPage?: number; disabled?: boolean; onPageChange: (page: number) => void }) {
  const knownTotal = total !== undefined && Number.isFinite(total) && total >= 0 ? total : undefined;
  const totalPages = knownTotal === undefined ? undefined : Math.max(1, Math.ceil(knownTotal / Math.max(1, pageSize)));
  const lastPage = totalPages === undefined ? undefined : Math.min(totalPages, maxPage ?? totalPages);
  const hasNext = (knownTotal === undefined ? count === pageSize : page < (lastPage ?? 1)) && (maxPage === undefined || page < maxPage);
  const [pageDraft, setPageDraft] = useState(String(page));
  useEffect(() => { setPageDraft(String(page)); }, [page]);
  return <nav className="pagination" aria-label="Pagination" aria-busy={disabled || undefined}>
    <p className="muted" aria-live="polite" aria-atomic="true">{knownTotal !== undefined ? `${knownTotal.toLocaleString()} results · ` : ''}Page {page}{lastPage !== undefined ? ` of ${lastPage}` : ''}{maxPage && page >= maxPage ? ' · Plan limit reached' : ''}</p>
    <div className="pagination-controls"><div className="cluster"><Button variant="secondary" size="sm" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}><Icon name="chevron-left" size={16} />Previous</Button><Button variant="secondary" size="sm" disabled={disabled || !hasNext} onClick={() => onPageChange(page + 1)}>Next<Icon name="chevron-right" size={16} /></Button></div>
      {lastPage !== undefined && lastPage > 5 && <form className="pagination-jump" onSubmit={event => { event.preventDefault(); const next = Number(pageDraft); if (!disabled && Number.isInteger(next) && next >= 1 && next <= lastPage) onPageChange(next); }}><label>Go to page<input type="number" inputMode="numeric" min={1} max={lastPage} step={1} required disabled={disabled} value={pageDraft} onChange={event => setPageDraft(event.target.value)} /></label><Button variant="secondary" size="sm" type="submit" disabled={disabled}>Go</Button></form>}
    </div>
  </nav>;
}

const iconNames: Record<string, string> = {
  edit: 'pencil', 'chevron-up': 'chevron-up', mobile: 'device-mobile', share: 'link', x: 'x',
  search: 'search', database: 'database', files: 'file-text', scan: 'scan', code: 'code', api: 'code', card: 'credit-card',
  bell: 'bell', copy: 'copy', download: 'download', external: 'external-link', menu: 'menu-2', close: 'x',
  'chevron-left': 'chevron-left', 'chevron-right': 'chevron-right', 'chevron-down': 'chevron-down',
  'chevrons-left': 'chevrons-left', 'chevrons-right': 'chevrons-right', plus: 'plus', arrow: 'arrow-right',
  check: 'check', sun: 'sun', moon: 'moon', refresh: 'refresh', filter: 'adjustments-horizontal', clock: 'clock', user: 'user',
  lock: 'lock', logout: 'logout', trash: 'trash', info: 'info-circle', grid: 'layout-grid', list: 'list',
  settings: 'settings', 'help-circle': 'help-circle', bookmark: 'bookmark', server: 'server', globe: 'world',
  shield: 'shield-check', package: 'package', key: 'key', desktop: 'device-desktop', users: 'users', mail: 'mail',
  adjustments: 'adjustments-horizontal', chart: 'chart-bar', alert: 'alert-circle', success: 'circle-check',
  file: 'file-text', more: 'dots', eye: 'eye', 'eye-off': 'eye-off', calendar: 'calendar', link: 'link',
  'arrow-up-right': 'arrow-up-right', 'arrow-left': 'arrow-left', folder: 'folder', receipt: 'receipt', wallet: 'wallet',
};
export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const path = asset(`icons/${iconNames[name] ?? 'info-circle'}.svg`);
  return <span className={join('icon icon--asset', className)} style={{ width: size, height: size, maskImage: `url("${path}")`, WebkitMaskImage: `url("${path}")` }} aria-hidden="true" />;
}
