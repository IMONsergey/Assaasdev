import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useApp } from './AppProvider';
import { Button, Dialog, Icon } from '../components/ui';
import { asset } from '../config';
import { errorMessage } from '../lib/format';
import { lockPageScroll } from '../lib/scroll-lock';
import { CreditBalance } from './CreditBalance';

const navigation = [
  { group: 'Explore', items: [
    { to: '/search', icon: 'search', label: 'Search' },
    { to: '/files', icon: 'database', label: 'Buckets & files' },
    { to: '/search/saved', icon: 'bookmark', label: 'Saved queries' },
  ] },
  { group: 'Workspace', items: [
    { to: '/scanner', icon: 'scan', label: 'Private Scanner' },
    { to: '/api', icon: 'code', label: 'API access' },
  ] },
];

function workspaceContext(path: string) {
  if (path.startsWith('/private/hosts') || path.startsWith('/hosts')) return { label: 'Host details', icon: 'server' };
  if (path === '/search/saved') return { label: 'Saved queries', icon: 'bookmark' };
  if (path === '/search/share') return { label: 'Shared search', icon: 'link' };
  if (path.startsWith('/private')) return { label: 'Private search', icon: 'shield' };
  if (path.startsWith('/files')) return { label: 'Buckets & files', icon: 'database' };
  if (path.startsWith('/scanner')) return { label: 'Private Scanner', icon: 'scan' };
  if (path.startsWith('/api')) return { label: 'API access', icon: 'code' };
  if (path.startsWith('/billing')) return { label: 'Billing', icon: 'card' };
  if (path.startsWith('/account') || path.startsWith('/settings')) return { label: 'Settings', icon: 'settings' };
  if (path.startsWith('/notifications')) return { label: 'Notifications', icon: 'bell' };
  return { label: 'Search', icon: 'search' };
}

export function AppShell({ collapsed, onCollapsedChange }: { collapsed: boolean; onCollapsedChange: (value: boolean) => void }) {
  const { session, user, connectionStatus, unreadCount, highLoad, toast, refreshSession } = useApp();
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [supportOpen, setSupportOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false), [checkingConnection, setCheckingConnection] = useState(false);
  const location = useLocation(), sidebar = useRef<HTMLElement>(null), menuButton = useRef<HTMLButtonElement>(null);
  const topbar = useRef<HTMLElement>(null), main = useRef<HTMLElement>(null);
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
      if (!document.querySelector('dialog[open]')) previous?.focus({ preventScroll: true });
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
  const plan = user?.subscription?.type;
  const isSearch = (location.pathname.startsWith('/search') && location.pathname !== '/search/saved') || location.pathname.startsWith('/hosts');
  const isPrivate = location.pathname.startsWith('/private') || location.pathname.startsWith('/scanner');
  const accountLabel = account ? 'Account settings' : guest ? 'Guest session' : 'Sign in';
  const context = workspaceContext(location.pathname);
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
        <button type="button" className="navigation-toggle" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed} onClick={() => onCollapsedChange(!collapsed)} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}><Icon name={collapsed ? 'chevrons-right' : 'chevrons-left'} size={18} /></button>
        <Button variant="ghost" className="mobile-nav-close" aria-label="Close navigation" onClick={() => setMenu(false)}><Icon name="close" /></Button>
      </div>
      <nav className="sidebar-primary" aria-label="Main navigation">
        {navigation.map(group => <div className="nav-group" key={group.group}><span className="nav-group-label">{group.group}</span>{group.items.map(item => <NavLink key={item.to} to={item.to} end={item.to === '/search'} aria-label={item.label} title={collapsed ? item.label : undefined} className={({ isActive }) => `nav-link${(item.to === '/search' ? isSearch : item.to === '/scanner' ? isPrivate : isActive) ? ' active' : ''}`}><Icon name={item.icon} size={19} /><span className="nav-label">{item.label}</span>{item.to === '/search' && <kbd className="nav-shortcut">⌘ K</kbd>}</NavLink>)}</div>)}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/billing" className="nav-link" aria-label="Billing" title={collapsed ? 'Billing' : undefined}><Icon name="card" size={19} /><span className="nav-label">Billing</span></NavLink>
        <button type="button" className="nav-link" aria-label="Support" title={collapsed ? 'Support' : undefined} onClick={() => { setMenu(false); setSupportOpen(true); }}><Icon name="help-circle" size={20} /><span className="nav-label">Support</span></button>
        <NavLink to="/settings" className="nav-link" aria-label="Settings" title={collapsed ? 'Settings' : undefined}><Icon name="settings" size={20} /><span className="nav-label">Settings</span></NavLink>
        <div className="sidebar-account-row">
          <Link to={account ? '/settings?section=profile' : '/auth/login'} className="nav-link account-nav" aria-label={accountLabel} title={collapsed ? accountLabel : user?.user_name}>
            <span className="avatar">{user?.user_name?.slice(0, 2).toUpperCase() || (guest ? 'G' : 'AC')}</span><span className="nav-label account-nav-copy"><strong>{account ? user?.user_name || 'Your account' : accountLabel}</strong><small>{account ? `${plan ?? 'Account'} plan` : guest ? 'Sign in to your account' : 'Your workspace'}</small></span><Icon name="chevron-right" size={15} />
          </Link>

        </div>
      </div>
    </aside>
    <header ref={topbar} className="app-topbar" inert={menu}>
      <button ref={menuButton} type="button" className="button button--ghost mobile-menu-button" aria-label="Open navigation" aria-expanded={menu} aria-controls="workspace-navigation" onClick={() => setMenu(true)}><Icon name="menu" /></button>
      <Link to="/search" className="mobile-logo" aria-label="APCOSYS home"><img className="brand-logo" src={asset('figma/home/imgApcosysLogo.svg')} alt="apcosys" width="112" height="22" /></Link>
      <div className="workspace-context"><Icon name={context.icon} size={17} /><span>{context.label}</span></div>
      <div id="workspace-tools" />
      <div className="topbar-account">
        {(session.error || connectionStatus === 'error' || connectionStatus === 'closed' && (account || guest)) && <button className="connection-status-button" onClick={() => setConnectionOpen(true)} title="Connection details"><Icon name="alert" size={17} /><span>Connection</span></button>}
        <Link to="/notifications" className="notification-link" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'} title="Notifications"><Icon name="bell" size={19} />{unreadCount > 0 && <span className="notification-dot" aria-hidden="true" />}</Link>
        {(account || guest) && <CreditBalance />}
        {!account && <Link className="upgrade-link" to="/auth/login">Sign in</Link>}
      </div>
    </header>
    <main ref={main} id="main-content" className="workspace-main" tabIndex={-1} inert={menu}>
      <Outlet key={user?.user_id || session.status} />

    </main>
    <Dialog open={supportOpen} onClose={() => { setSupportOpen(false); if (mobile) requestAnimationFrame(() => menuButton.current?.focus()); }} title="Help & support" size="sm">
      <div className="support-content stack">
        <section><h3>Start a search</h3><p>Enter a domain, IP address or technical attribute. Use Filters to combine conditions and narrow your results. Press <kbd>/</kbd> or <kbd>⌘ / Ctrl K</kbd> to jump to search.</p></section>
        <section><h3>Explore the API</h3><p>Find connection details, request examples and your API key in <Link to="/api" onClick={() => setSupportOpen(false)}>API access</Link>.</p></section>
        <section><h3>Manage your workspace</h3><p>Appearance, account access and connection information are together in <Link to="/settings" onClick={() => setSupportOpen(false)}>Settings</Link>.</p></section>
      </div>
    </Dialog>
    <Dialog open={connectionOpen} onClose={() => setConnectionOpen(false)} title="Connection" size="sm" footer={<><Button variant="secondary" onClick={() => setConnectionOpen(false)}>Close</Button><Button loading={checkingConnection} onClick={async () => { setCheckingConnection(true); try { await refreshSession(); toast('Connection checked.', 'success'); setConnectionOpen(false); } catch (error) { toast(errorMessage(error), 'error'); } finally { setCheckingConnection(false); } }}>Try again</Button></>}><p>{session.error || 'The workspace is offline. Reconnect to continue.'}</p>{session.status === 'anonymous' && <Link className="inline-link" to="/auth/login" onClick={() => setConnectionOpen(false)}>Sign in</Link>}</Dialog>
  </div>;
}
