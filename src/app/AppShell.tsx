import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useApp } from './AppProvider';
import { Button, Dialog, Icon } from '../components/ui';
import { asset } from '../config';
import { errorMessage } from '../lib/format';
import { lockPageScroll } from '../lib/scroll-lock';
import { CreditBalance } from './CreditBalance';
import { SupportDialog } from '../features/support/SupportDialog';
import { ScenarioGuide } from '../features/journeys/ScenarioGuide';
import { AccountMenu } from './AccountMenu';
import { WorkspaceEntrance, useWorkspaceEntrance } from './WorkspaceEntrance';
import './shell-polish.css';

const navigation = [
    { to: '/search', icon: 'search', label: 'Search' },
    { to: '/files', icon: 'database', label: 'Buckets & files' },
    { to: '/search/saved', icon: 'bookmark', label: 'Saved queries' },
    { to: '/scanner', icon: 'scan', label: 'Private Scanner' },
    { to: '/api', icon: 'code', label: 'API & docs' },
];

function NavigationToggleIcon({ collapsed }: { collapsed: boolean }) {
  return <svg className="navigation-toggle-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /><path className={collapsed ? 'is-collapsed' : undefined} d="m16 9-3 3 3 3" /></svg>;
}

export function AppShell({ collapsed, onCollapsedChange }: { collapsed: boolean; onCollapsedChange: (value: boolean) => void }) {
  const { session, user, connectionStatus, unreadCount, highLoad, toast, refreshSession } = useApp();
  const entrance = useWorkspaceEntrance(session.status);
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [supportOpen, setSupportOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false), [checkingConnection, setCheckingConnection] = useState(false);
  const location = useLocation(), sidebar = useRef<HTMLElement>(null), menuButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const locationKey = useRef(location.key);
  locationKey.current = location.key;
  const navigate = useNavigate();

  useEffect(() => {
    if (entrance !== 'ready') return;
    const frame = requestAnimationFrame(() => {
      if (document.querySelector('dialog[open]')) return;
      // A deep link or a page control may already own focus after the shell
      // becomes interactive. Keep that more specific reading position.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== main.current && main.current?.contains(focused) && !focused.closest('[inert], [hidden]')) return;
      // The empty search entry is ready for typing; a restored results page is
      // ready for reading and must not reopen the query's suggestion overlay.
      const target = main.current?.querySelector<HTMLElement>('.search-page-home #main-search-query') ?? main.current;
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [entrance]);

  useEffect(() => { setMenu(false); }, [location.pathname, location.search]);
  useEffect(() => {
    const breakpoint = window.matchMedia('(max-width: 760px)');
    const closeOnDesktop = () => { setMobile(breakpoint.matches); if (!breakpoint.matches) setMenu(false); };
    breakpoint.addEventListener('change', closeOnDesktop);
    return () => breakpoint.removeEventListener('change', closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    const openedOn = locationKey.current;
    const unlock = lockPageScroll();
    const root = sidebar.current;
    root?.querySelector<HTMLElement>('button, a')?.focus();
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { setMenu(false); return; }
      if (event.key !== 'Tab') return;
      const items = [...(root?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)') ?? [])].filter(el => el.offsetParent !== null);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => {
      unlock();
      document.removeEventListener('keydown', key);
      if (!document.querySelector('dialog[open]')) {
        if (locationKey.current !== openedOn) main.current?.focus({ preventScroll: true });
        else previous?.focus({ preventScroll: true });
      }
    };
  }, [menu]);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.closest('input,textarea,select,[contenteditable="true"]');
      const shortcut = event.key === '/' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey;
      const command = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey;
      if ((!shortcut && !command) || document.querySelector('dialog[open]') || menu) return;
      event.preventDefault();
      const input = document.getElementById('main-search-query') as HTMLInputElement | null;
      if (input) { input.focus(); input.select(); }
      else navigate('/search', { state: { focusSearch: true } });
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, [menu, navigate]);
  useEffect(() => {
    if (!location.state?.focusSearch) return;
    const frame = requestAnimationFrame(() => document.getElementById('main-search-query')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [location.key, location.state]);

  const account = session.status === 'authenticated', guest = session.status === 'guest';
  const isSearch = (location.pathname.startsWith('/search') && location.pathname !== '/search/saved') || location.pathname.startsWith('/hosts');
  const isPrivate = location.pathname.startsWith('/private') || location.pathname.startsWith('/scanner');
  const accountLabel = guest ? 'Guest session' : 'Sign in';
  const closeConnection = () => {
    setConnectionOpen(false);
    if (mobile) requestAnimationFrame(() => menuButton.current?.focus());
  };
  useEffect(() => { if (highLoad) toast(highLoad, 'info'); }, [highLoad, toast]);
  useEffect(() => { if (session.error) toast(session.error, 'error'); }, [session.error, toast]);

  return <><WorkspaceEntrance phase={entrance} /><div className={`app-shell${collapsed ? ' app-shell--collapsed' : ''}${entrance === 'ready' || entrance === 'leaving' ? ' workspace-arrived' : ' workspace-arriving'}`} inert={entrance !== 'ready'}>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <button ref={menuButton} type="button" className="mobile-workspace-menu" aria-label="Open navigation" aria-expanded={menu} aria-controls="workspace-navigation" inert={menu} onClick={() => setMenu(true)}><Icon name="menu" size={21} /></button>
    <button type="button" className={`mobile-nav-backdrop${menu ? ' is-open' : ''}`} tabIndex={-1} aria-label="Close navigation" onClick={() => setMenu(false)} />
    <aside ref={sidebar} id="workspace-navigation" className={`app-sidebar${menu ? ' is-open' : ''}`} aria-label="Workspace navigation" inert={mobile && !menu}>
      <div className="brand-slot">
        <Link to="/search" className="brand-link" aria-label="APCOSYS home" tabIndex={collapsed && !mobile ? -1 : undefined} aria-hidden={collapsed && !mobile || undefined}>
          <img className="brand-logo" src={asset('figma/home/imgApcosysLogo.svg')} width="120" height="24" alt="apcosys" />
          <span className="brand-symbol icon icon--asset" style={{ width: 26, height: 26, maskImage: `url("${asset('figma/home/imgApcosysSymbol.svg')}")`, WebkitMaskImage: `url("${asset('figma/home/imgApcosysSymbol.svg')}")` }} aria-hidden="true" />
        </Link>
        <button type="button" className="navigation-toggle" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-controls="workspace-navigation" aria-expanded={!collapsed} onClick={() => onCollapsedChange(!collapsed)} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}><NavigationToggleIcon collapsed={collapsed} /></button>
        <Button variant="ghost" className="mobile-nav-close" aria-label="Close navigation" onClick={() => setMenu(false)}><Icon name="close" /></Button>
      </div>
      <nav className="sidebar-primary" aria-label="Main navigation">
        {navigation.map(item => <NavLink key={item.to} to={item.to} end={item.to === '/search'} aria-label={item.label} title={collapsed ? item.label : undefined} className={({ isActive }) => `nav-link${(item.to === '/search' ? isSearch : item.to === '/scanner' ? isPrivate : isActive) ? ' active' : ''}`}><Icon name={item.icon} size={19} /><span className="nav-label">{item.label}</span></NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/billing" className="nav-link" aria-label="Billing" title={collapsed ? 'Billing' : undefined}><Icon name="card" size={19} /><span className="nav-label">Billing</span></NavLink>
        <button type="button" className="nav-link" data-onboarding="support" aria-label="Support" title={collapsed ? 'Support' : undefined} onClick={() => { setMenu(false); setSupportOpen(true); }}><Icon name="help-circle" size={20} /><span className="nav-label">Support</span></button>
        <NavLink to="/settings" className="nav-link" data-onboarding="settings-navigation" aria-label="Settings" title={collapsed ? 'Settings' : undefined}><Icon name="settings" size={20} /><span className="nav-label">Settings</span></NavLink>
        <NavLink to="/notifications" className="nav-link sidebar-notifications" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'} title={collapsed ? 'Notifications' : undefined}><Icon name="bell" size={19} /><span className="nav-label">Notifications</span>{unreadCount > 0 && <span className="sidebar-unread" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}</NavLink>
        {(session.error || connectionStatus === 'error' || connectionStatus === 'closed' && (account || guest)) && <button className="nav-link sidebar-connection" onClick={() => { setMenu(false); setConnectionOpen(true); }} title="Connection details"><Icon name="alert" size={18} /><span className="nav-label">Connection</span></button>}
        {(account || guest) && <div className="sidebar-credits"><CreditBalance collapsed={collapsed && !mobile} /></div>}
        <div className="sidebar-account-row">
          {account ? <AccountMenu collapsed={collapsed} mobile={mobile} onNavigate={() => setMenu(false)} /> : <Link to="/auth/login" className="nav-link account-nav" aria-label={accountLabel} title={collapsed ? accountLabel : undefined}><span className="account-guest-avatar"><Icon name="user" size={20} /></span><span className="nav-label account-nav-copy"><strong>{accountLabel}</strong><small>{guest ? 'Sign in to your account' : 'Your workspace'}</small></span><Icon name="chevron-right" size={15} /></Link>}
        </div>
      </div>
    </aside>
    <main ref={main} id="main-content" className="workspace-main" tabIndex={-1} inert={menu}>
      <ScenarioGuide />
      <Outlet key={user?.user_id || session.status} />

    </main>
    <SupportDialog open={supportOpen} onClose={() => { setSupportOpen(false); if (mobile) requestAnimationFrame(() => menuButton.current?.focus()); }} />
    <Dialog open={connectionOpen} onClose={closeConnection} title="Connection" size="sm" footer={<><Button variant="secondary" onClick={closeConnection}>Close</Button><Button loading={checkingConnection} onClick={async () => { setCheckingConnection(true); try { await refreshSession(); toast('Connection checked.', 'success'); closeConnection(); } catch (error) { toast(errorMessage(error), 'error'); } finally { setCheckingConnection(false); } }}>Try again</Button></>}><p>{session.error || 'The workspace is offline. Reconnect to continue.'}</p>{session.status === 'anonymous' && <Link className="inline-link" to="/auth/login" onClick={() => setConnectionOpen(false)}>Sign in</Link>}</Dialog>
  </div></>;
}
