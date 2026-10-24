import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

const navigation = [
    { to: '/search', icon: 'search', label: 'Search' },
    { to: '/files', icon: 'database', label: 'Buckets & files' },
    { to: '/search/saved', icon: 'bookmark', label: 'Saved queries' },
    { to: '/scanner', icon: 'scan', label: 'Private Scanner' },
    { to: '/api', icon: 'code', label: 'API access' },
];

function NavigationToggleIcon({ collapsed }: { collapsed: boolean }) {
  return <svg className="navigation-toggle-icon" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /><path className={collapsed ? 'is-collapsed' : undefined} d="m16 9-3 3 3 3" /></svg>;
}

export function AppShell({ collapsed, onCollapsedChange }: { collapsed: boolean; onCollapsedChange: (value: boolean) => void }) {
  const { session, user, connectionStatus, unreadCount, highLoad, toast, refreshSession } = useApp();
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [supportOpen, setSupportOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false), [checkingConnection, setCheckingConnection] = useState(false);
  const location = useLocation(), sidebar = useRef<HTMLElement>(null), menuButton = useRef<HTMLButtonElement>(null);
  const topbar = useRef<HTMLElement>(null), main = useRef<HTMLElement>(null);
  const locationKey = useRef(location.key);
  locationKey.current = location.key;
  const navigate = useNavigate();

  useEffect(() => { setMenu(false); }, [location.pathname, location.search]);
  useLayoutEffect(() => {
    const header = topbar.current, content = main.current;
    if (!header || !content) return;
    const syncHeaderHeight = () => content.style.setProperty('--workspace-header-height', `${header.getBoundingClientRect().height}px`);
    syncHeaderHeight();
    const observer = new ResizeObserver(syncHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
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
  useEffect(() => { if (highLoad) toast(highLoad, 'info'); }, [highLoad, toast]);
  useEffect(() => { if (session.error) toast(session.error, 'error'); }, [session.error, toast]);

  return <div className={`app-shell${collapsed ? ' app-shell--collapsed' : ''}`}>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <button type="button" className={`mobile-nav-backdrop${menu ? ' is-open' : ''}`} tabIndex={-1} aria-label="Close navigation" onClick={() => setMenu(false)} />
    <aside ref={sidebar} id="workspace-navigation" className={`app-sidebar${menu ? ' is-open' : ''}`} aria-label="Workspace navigation" inert={mobile && !menu}>
      <div className="brand-slot">
        <Link to="/search" className="brand-link" aria-label="APCOSYS home">
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
        <NavLink to="/scenarios" className="nav-link" aria-label="Scenarios" title={collapsed ? 'Scenarios' : undefined}><Icon name="grid" size={19} /><span className="nav-label">Scenarios</span></NavLink>
        <div className="sidebar-account-row">
          {account ? <AccountMenu collapsed={collapsed} mobile={mobile} onNavigate={() => setMenu(false)} /> : <Link to="/auth/login" className="nav-link account-nav" aria-label={accountLabel} title={collapsed ? accountLabel : undefined}><span className="account-guest-avatar"><Icon name="user" size={20} /></span><span className="nav-label account-nav-copy"><strong>{accountLabel}</strong><small>{guest ? 'Sign in to your account' : 'Your workspace'}</small></span><Icon name="chevron-right" size={15} /></Link>}
        </div>
      </div>
    </aside>
    <header ref={topbar} className="app-topbar" inert={menu}>
      <button ref={menuButton} type="button" className="button button--ghost mobile-menu-button" aria-label="Open navigation" aria-expanded={menu} aria-controls="workspace-navigation" onClick={() => setMenu(true)}><Icon name="menu" /></button>
      <Link to="/search" className="mobile-logo" aria-label="APCOSYS home"><img className="brand-logo" src={asset('figma/home/imgApcosysLogo.svg')} alt="apcosys" width="112" height="22" /></Link>
      <div id="workspace-tools" />
      <div className="topbar-account">
        {(session.error || connectionStatus === 'error' || connectionStatus === 'closed' && (account || guest)) && <button className="connection-status-button" onClick={() => setConnectionOpen(true)} title="Connection details"><Icon name="alert" size={17} /><span>Connection</span></button>}
        <Link to="/notifications" className="notification-link" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'} title="Notifications"><Icon name="bell" size={19} />{unreadCount > 0 && <span className="notification-dot" aria-hidden="true" />}</Link>
        {(account || guest) && <CreditBalance />}
        {!account && <Link className="upgrade-link" to="/auth/login">Sign in</Link>}
      </div>
    </header>
    <main ref={main} id="main-content" className="workspace-main" tabIndex={-1} inert={menu}>
      <ScenarioGuide />
      <Outlet key={user?.user_id || session.status} />

    </main>
    <SupportDialog open={supportOpen} onClose={() => { setSupportOpen(false); if (mobile) requestAnimationFrame(() => menuButton.current?.focus()); }} />
    <Dialog open={connectionOpen} onClose={() => setConnectionOpen(false)} title="Connection" size="sm" footer={<><Button variant="secondary" onClick={() => setConnectionOpen(false)}>Close</Button><Button loading={checkingConnection} onClick={async () => { setCheckingConnection(true); try { await refreshSession(); toast('Connection checked.', 'success'); setConnectionOpen(false); } catch (error) { toast(errorMessage(error), 'error'); } finally { setCheckingConnection(false); } }}>Try again</Button></>}><p>{session.error || 'The workspace is offline. Reconnect to continue.'}</p>{session.status === 'anonymous' && <Link className="inline-link" to="/auth/login" onClick={() => setConnectionOpen(false)}>Sign in</Link>}</Dialog>
  </div>;
}
