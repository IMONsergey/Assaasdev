import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { createPortal } from 'react-dom';
import { Icon } from '../components/ui';
import { UserAvatar } from '../components/UserAvatar';
import { useApp } from './AppProvider';

/** A native light-dismiss surface; identity and plan keep one predictable place. */
export function AccountMenu({ collapsed, mobile, onNavigate }: { collapsed: boolean; mobile: boolean; onNavigate: () => void }) {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const id = useId(), location = useLocation();
  const name = user?.user_name || 'Your account';
  const plan = user?.subscription?.type;

  useEffect(() => { setOpen(false); }, [location.pathname, location.search, collapsed, mobile, user?.user_id]);
  useLayoutEffect(() => {
    const surface = panel.current, button = trigger.current;
    if (!surface || !button) return;
    if (!open) { if (surface.matches(':popover-open')) surface.hidePopover(); return; }
    const position = () => {
      const rect = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      const height = viewport?.height ?? innerHeight;
      const top = viewport?.offsetTop ?? 0;
      const width = Math.min(304, innerWidth - 24);
      surface.style.width = `${width}px`;
      surface.style.left = `${mobile ? Math.max(12, (innerWidth - width) / 2) : Math.min(Math.max(12, rect.left), innerWidth - width - 12)}px`;
      surface.style.bottom = `${mobile ? Math.max(12, innerHeight - top - height + 12) : Math.max(12, innerHeight - rect.top + 8)}px`;
      surface.style.maxHeight = `${Math.max(160, mobile ? height - 32 : rect.top - 20)}px`;
    };
    position();
    if (!surface.matches(':popover-open')) surface.showPopover();
    const frame = requestAnimationFrame(() => surface.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }));
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
    };
  }, [open, mobile]);

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
    if (event.key === 'Tab') { setOpen(false); trigger.current?.focus(); return; }
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? (current + 1) % items.length : event.key === 'ArrowUp' ? (current - 1 + items.length) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); items[next]?.focus(); }
  }
  function navigate() { setOpen(false); onNavigate(); }

  return <>
    <button ref={trigger} type="button" className="nav-link account-nav" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} aria-controls={id} title={collapsed && !mobile ? `${name}${plan ? ` · ${plan}` : ''}` : undefined} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>
      <UserAvatar principal={user?.user_id} size={36} />
      <span className="nav-label account-nav-copy"><strong>{name}</strong><small>{plan ? `${plan} plan` : 'Profile & preferences'}</small></span>
      <Icon name="chevron-up" size={16} className="account-nav-chevron" />
    </button>
    {createPortal(<div id={id} ref={panel} popover="auto" className="account-popover" onToggle={() => setOpen(panel.current?.matches(':popover-open') ?? false)} onKeyDown={keys}>
      <header className="account-popover-identity"><UserAvatar principal={user?.user_id} size={44} /><div><strong>{name}</strong>{user?.email && <span>{user.email}</span>}</div></header>
      <nav role="menu" aria-label="Account actions">
        <Link role="menuitem" to="/settings?section=profile" className="account-menu-item" onClick={navigate}><Icon name="user" size={18} /><span>Profile & avatar</span><Icon name="chevron-right" size={15} /></Link>
        <Link role="menuitem" to="/settings" className="account-menu-item" onClick={navigate}><Icon name="sun" size={18} /><span>Appearance</span><Icon name="chevron-right" size={15} /></Link>
        <Link role="menuitem" to="/billing" className="account-menu-item account-menu-plan" onClick={navigate} aria-label="Manage plan"><Icon name="card" size={18} /><span><small>Current plan</small><strong>{plan || 'Unavailable'}</strong></span><Icon name="chevron-right" size={15} /></Link>
      </nav>
    </div>, document.body)}
  </>;
}
