import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiError } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Button, ConfirmDialog, Dialog, EmptyState, Icon, PageHeader, Skeleton } from '../../components/ui';
import { errorMessage } from '../../lib/format';
import { useTabOverflow } from '../../lib/tab-overflow';
import { ProfilePanel, SecurityPanel, SessionsPanel, TeamPanel } from '../account/AccountPage';
import { IndexStatistics } from '../search/IndexStatistics';
import { LegalPanel } from './LegalPanel';
import './settings.css';

const sections = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'security', label: 'Security', icon: 'shield' },
  { id: 'sessions', label: 'Sessions', icon: 'desktop' },
  { id: 'team', label: 'Organization', icon: 'users' },
  { id: 'workspace', label: 'Workspace', icon: 'adjustments' },
  { id: 'appearance', label: 'Appearance', icon: 'sun' },
  { id: 'legal', label: 'Legal', icon: 'file' },
] as const;
type SettingsSection = typeof sections[number]['id'];

function SettingsRow({ title, description, children, htmlFor }: { title: string; description?: string; children: ReactNode; htmlFor?: string }) {
  return <div className="settings-row"><div className="settings-row-copy">{htmlFor ? <label className="settings-row-title" htmlFor={htmlFor}>{title}</label> : <h3 className="settings-row-title">{title}</h3>}{description && <p id={htmlFor ? `${htmlFor}-description` : undefined}>{description}</p>}</div><div className="settings-row-control">{children}</div></div>;
}

function SignOut() {
  const { logout, refreshSession, toast } = useApp();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [checking, setChecking] = useState(false);
  const [error, setError] = useState(''), [unknown, setUnknown] = useState(false);
  return <>
    <div className="settings-signout"><div><h3>Sign out</h3><p>End your sessions on all devices.</p></div><Button variant="secondary" onClick={() => setOpen(true)}><Icon name="logout" size={17} />Sign out</Button></div>
    <ConfirmDialog open={open} onClose={() => setOpen(false)} title="Sign out of every session?" description={<div className="stack"><p>All devices will be signed out of APCOSYS. You can sign in again at any time.</p>{error && <Alert tone="warning" title={unknown ? 'Sign-out not yet confirmed' : 'Sign-out failed'}>{error}{unknown && <Button variant="secondary" loading={checking} onClick={async () => { setChecking(true); try { await refreshSession(); setUnknown(false); setError('Session checked. You can try signing out again.'); } catch (cause) { setError(errorMessage(cause)); } finally { setChecking(false); } }}>Check current session</Button>}</Alert>}</div>} confirmDisabled={unknown || checking} confirmLabel="Sign out everywhere" busy={busy} onConfirm={async () => { setBusy(true); try { await logout(); setOpen(false); toast('Signed out.', 'success'); } catch (cause) { setError(errorMessage(cause)); setUnknown(cause instanceof ApiError && cause.outcome === 'unknown'); } finally { setBusy(false); } }} />
  </>;
}

export function SettingsPage() {
  const { preferences, setPreferences, connectionStatus, refreshSession, toast, user, session } = useApp();
  const [params, setParams] = useSearchParams();
  const requested = params.get('section') === 'account' ? 'profile' : params.get('section');
  const section: SettingsSection = sections.find(item => item.id === requested)?.id ?? 'profile';
  const { ref: navigation, overflow } = useTabOverflow(section);
  const activeSection = sections.find(item => item.id === section)!;
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const sectionChoices = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sectionPickerOpen) return;
    let active = true;
    queueMicrotask(() => { if (active) sectionChoices.current?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus({ preventScroll: true }); });
    return () => { active = false; };
  }, [sectionPickerOpen]);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => { setMobile(query.matches); if (!query.matches) setSectionPickerOpen(false); };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const [visited, setVisited] = useState(() => new Set<SettingsSection>([section]));
  const [checkingConnection, setCheckingConnection] = useState(false);
  useEffect(() => { setVisited(previous => previous.has(section) ? previous : new Set([...previous, section])); }, [section]);
  const themes = [
    { id: 'light' as const, label: 'Light', description: 'Light interface' },
    { id: 'dark' as const, label: 'Dark', description: 'Dark interface' },
    { id: 'system' as const, label: 'System', description: 'Match your device' },
  ];
  function selectSection(next: SettingsSection) { setVisited(previous => new Set([...previous, next])); setParams(next === 'profile' ? {} : { section: next }, { state: { preserveTabFocus: true } }); }
  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    const index = sections.findIndex(item => item.id === section);
    const next = ['ArrowRight', 'ArrowDown'].includes(event.key) ? (index + 1) % sections.length : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (index + sections.length - 1) % sections.length : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); selectSection(sections[next].id); event.currentTarget.querySelector<HTMLButtonElement>(`#settings-tab-${sections[next].id}`)?.focus({ preventScroll: true });
  }
  return <div className="settings-page">
    <PageHeader title="Settings" />
    {mobile && <button type="button" className="settings-section-picker" data-onboarding="settings-sections" aria-label={`Choose settings section: ${activeSection.label}`} aria-haspopup="dialog" aria-expanded={sectionPickerOpen} onClick={() => setSectionPickerOpen(true)}><span className="settings-section-symbol"><Icon name={activeSection.icon} size={20} /></span><span>{activeSection.label}</span><Icon name="chevron-down" size={18} /></button>}
    <Dialog open={sectionPickerOpen} onClose={() => setSectionPickerOpen(false)} title="Settings categories" size="sm" className="settings-category-dialog"><div ref={sectionChoices} className="settings-category-list">{sections.map(item => <button key={item.id} type="button" aria-current={section === item.id ? 'page' : undefined} onClick={() => { selectSection(item.id); setSectionPickerOpen(false); }}><span className="settings-category-icon"><Icon name={item.icon} size={20} /></span><span>{item.label}</span><Icon name={section === item.id ? 'check' : 'chevron-right'} size={18} /></button>)}</div></Dialog>
    <div className="settings-workspace">
      <div ref={navigation} data-tab-overflow={overflow} className="settings-navigation" role="tablist" aria-label="Settings categories" aria-orientation="vertical" onKeyDown={navigateTabs}>{sections.map(item => <button key={item.id} id={`settings-tab-${item.id}`} type="button" role="tab" aria-selected={section === item.id} aria-controls={`settings-panel-${item.id}`} tabIndex={section === item.id ? 0 : -1} onClick={() => selectSection(item.id)}><Icon name={item.icon} size={18} />{item.label}</button>)}</div>
      <div className="settings-content">
        <section className="settings-panel" id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance" hidden={section !== 'appearance'}>
      <div className="settings-group settings-theme-group">
        <div className="settings-group-heading"><h2>Color theme</h2></div>
        <div className="theme-options" data-onboarding="theme-options" role="group" aria-label="Color theme">
          {themes.map(theme => <button key={theme.id} type="button" className={`theme-option${preferences.theme === theme.id ? ' is-selected' : ''}`} aria-label={`${theme.label} theme`} aria-pressed={preferences.theme === theme.id} onClick={() => setPreferences({ theme: theme.id })}>
            <span className={`theme-preview theme-preview--${theme.id}`} aria-hidden="true">
              <span className="theme-preview-nav"><i /><i /><i /></span>
              <span className="theme-preview-body"><i /><i /><span><b /></span></span>
            </span>
            <span className="theme-option-heading">{theme.label}<span className="theme-radio">{preferences.theme === theme.id && <Icon name="check" size={12} />}</span></span>

          </button>)}
        </div>
      </div>

      <div className="settings-group settings-controls-group">
        <SettingsRow title="Interface density" description="Choose more space or a more compact view." htmlFor="settings-density">
          <select id="settings-density" value={preferences.density} aria-describedby="settings-density-description" onChange={event => setPreferences({ density: event.target.value as 'comfortable' | 'compact' })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select>
        </SettingsRow>
        <SettingsRow title="Text size" description="Adjust text throughout the workspace." htmlFor="settings-text-size">
          <select id="settings-text-size" value={preferences.fontScale} aria-describedby="settings-text-size-description" onChange={event => setPreferences({ fontScale: Number(event.target.value) as 100 | 112 | 125 })}><option value={100}>Default · 100%</option><option value={112}>Larger · 112%</option><option value={125}>Largest · 125%</option></select>
        </SettingsRow>
        <SettingsRow title="Reduce interface motion" description="Use quieter transitions. Your device’s motion preference also applies." htmlFor="settings-reduce-motion">
          <label className="settings-switch"><input id="settings-reduce-motion" type="checkbox" role="switch" aria-describedby="settings-reduce-motion-description" checked={preferences.reducedMotion} onChange={event => setPreferences({ reducedMotion: event.target.checked })} /><span aria-hidden="true" /></label>
        </SettingsRow>
      </div>
      <footer className="settings-footer"><p>Saved on this device.</p><Button variant="ghost" size="sm" onClick={() => { setPreferences({ theme: 'light', density: 'comfortable', fontScale: 100, reducedMotion: false, navigationCollapsed: false }); toast('Default appearance restored.'); }}>Restore defaults</Button></footer>
        </section>
        {(['profile', 'security', 'sessions', 'team'] as const).map(id => <section key={id} className="settings-panel settings-account-panel" id={`settings-panel-${id}`} role="tabpanel" aria-labelledby={`settings-tab-${id}`} hidden={section !== id}>
          {(visited.has(id) || section === id) && (session.status === 'loading' ? <Skeleton rows={3} /> : session.status !== 'authenticated' || !user ? <EmptyState title="Account settings" icon={<Icon name="user" size={26} />} description="Sign in to manage your profile and access." actions={<Link className="button" to={`/auth/login?returnTo=${encodeURIComponent('/settings?section=' + id)}`}>Sign in</Link>} /> : <div className="account-page stack">{id === 'profile' ? <><ProfilePanel user={user} /><SignOut /></> : id === 'security' ? <SecurityPanel user={user} /> : id === 'sessions' ? <SessionsPanel /> : <TeamPanel user={user} />}</div>)}
        </section>)}
        <section className="settings-panel" id="settings-panel-workspace" role="tabpanel" aria-labelledby="settings-tab-workspace" hidden={section !== 'workspace'}>
          <div className="settings-group-heading"><h2>Preferences & connections</h2></div>
          <div className="settings-controls-group">
            <SettingsRow title="Language"><span className="settings-static-value">English</span></SettingsRow>
            <SettingsRow title="Connection"><div className="settings-connection-actions"><span className={`settings-connection-state${connectionStatus === 'open' ? ' is-connected' : ''}`}>{connectionStatus === 'open' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting' : 'Offline'}</span><Button variant="secondary" size="sm" loading={checkingConnection} onClick={async () => { setCheckingConnection(true); try { await refreshSession(); toast('Connection checked.', 'success'); } catch (error) { toast(errorMessage(error), 'error'); } finally { setCheckingConnection(false); } }}>Check connection</Button></div></SettingsRow>
            <SettingsRow title="Notifications" description="Updates about payments, access and your team."><Link className="button button--secondary button--sm" to="/notifications">Open inbox<Icon name="arrow-up-right" size={16} /></Link></SettingsRow>
            <SettingsRow title="API access"><Link className="button button--secondary button--sm" to="/api">Manage API key<Icon name="arrow-up-right" size={16} /></Link></SettingsRow>
            <SettingsRow title="Search history" description="Manage searches saved in this browser."><Link className="button button--secondary button--sm" to="/search/history">Manage history<Icon name="arrow-up-right" size={16} /></Link></SettingsRow>
          </div>
          <IndexStatistics />
        </section>
        <section className="settings-panel" id="settings-panel-legal" role="tabpanel" aria-labelledby="settings-tab-legal" hidden={section !== 'legal'}><LegalPanel /></section>
      </div>
    </div>
  </div>;
}
