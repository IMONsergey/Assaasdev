import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useApp } from '../../app/AppProvider';
import { Badge, Button, Icon } from '../../components/ui';
import { errorMessage } from '../../lib/format';
import { IndexStatistics } from '../search/IndexStatistics';
import './settings.css';

const sections = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
  { id: 'workspace', label: 'Workspace' },
] as const;
type SettingsSection = typeof sections[number]['id'];

function SettingsRow({ title, description, children, htmlFor }: { title: string; description: string; children: ReactNode; htmlFor?: string }) {
  return <div className="settings-row">
    <div className="settings-row-copy">
      {htmlFor ? <label className="settings-row-title" htmlFor={htmlFor}>{title}</label> : <h3 className="settings-row-title">{title}</h3>}
      <p id={htmlFor ? `${htmlFor}-description` : undefined}>{description}</p>
    </div>
    <div className="settings-row-control">{children}</div>
  </div>;
}

function SettingsLink({ to, icon, title, description }: { to: string; icon: string; title: string; description: string }) {
  return <Link to={to} className="settings-link-row">
    <span className="settings-link-icon"><Icon name={icon} size={20} /></span>
    <span className="settings-link-copy"><span className="settings-row-title">{title}</span><span>{description}</span></span>
    <Icon name="chevron-right" size={17} />
  </Link>;
}

export function SettingsPage() {
  const { preferences, setPreferences, mode, connectionStatus, refreshSession, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const [checkingConnection, setCheckingConnection] = useState(false);
  const section: SettingsSection = sections.find(item => item.id === params.get('section'))?.id ?? 'appearance';
  const themes = [
    { id: 'light' as const, label: 'Light', description: 'Bright and clear.' },
    { id: 'dark' as const, label: 'Dark', description: 'Comfortable in low light.' },
    { id: 'system' as const, label: 'System', description: 'Match your device.' },
  ];

  function selectSection(next: SettingsSection) {
    setParams(next === 'appearance' ? {} : { section: next });
  }

  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    const index = sections.findIndex(item => item.id === section);
    const next = event.key === 'ArrowRight' ? (index + 1) % sections.length
      : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    selectSection(sections[next].id);
    event.currentTarget.querySelector<HTMLButtonElement>(`#settings-tab-${sections[next].id}`)?.focus();
  }

  return <div className="settings-page">
    <header className="settings-heading"><h1>Settings</h1><p>Make the workspace work for you.</p></header>
    <div className="settings-tabs" role="tablist" aria-label="Settings categories" onKeyDown={navigateTabs}>
      {sections.map(item => <button key={item.id} id={`settings-tab-${item.id}`} type="button" role="tab" aria-selected={section === item.id} aria-controls={`settings-panel-${item.id}`} tabIndex={section === item.id ? 0 : -1} onClick={() => selectSection(item.id)}>{item.label}</button>)}
    </div>

    <section className="settings-panel" id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance" hidden={section !== 'appearance'}>
      <div className="settings-group settings-theme-group">
        <div className="settings-group-heading"><h2>Color theme</h2><p>Choose how APCOSYS looks on this device.</p></div>
        <div className="theme-options" role="group" aria-label="Color theme">
          {themes.map(theme => <button key={theme.id} type="button" className={`theme-option${preferences.theme === theme.id ? ' is-selected' : ''}`} aria-label={`${theme.label} theme`} aria-pressed={preferences.theme === theme.id} onClick={() => setPreferences({ theme: theme.id })}>
            <span className={`theme-preview theme-preview--${theme.id}`} aria-hidden="true">
              <span className="theme-preview-nav"><i /><i /><i /></span>
              <span className="theme-preview-body"><i /><i /><span><b /></span></span>
            </span>
            <span className="theme-option-heading">{theme.label}<span className="theme-radio">{preferences.theme === theme.id && <Icon name="check" size={12} />}</span></span>
            <small>{theme.description}</small>
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
      <footer className="settings-footer"><p>Saved automatically on this device.</p><Button variant="ghost" size="sm" onClick={() => { setPreferences({ theme: 'light', density: 'comfortable', fontScale: 100, reducedMotion: false }); toast('Default appearance restored.'); }}>Restore defaults</Button></footer>
    </section>

    <section className="settings-panel" id="settings-panel-account" role="tabpanel" aria-labelledby="settings-tab-account" hidden={section !== 'account'}>
      <div className="settings-group-heading"><h2>Account & access</h2><p>Manage your identity and how you sign in.</p></div>
      <div className="settings-link-list">
        <SettingsLink to="/account" icon="user" title="Profile" description="Your name, email address and account details." />
        <SettingsLink to="/account/security" icon="lock" title="Password & security" description="Password, two-factor authentication and backup codes." />
        <SettingsLink to="/account/sessions" icon="clock" title="Signed-in devices" description="Review and manage your active sessions." />
        <SettingsLink to="/account/team" icon="grid" title="Organization" description="Manage members and shared access." />
        <SettingsLink to="/api" icon="code" title="API key" description="View and rotate your account’s API key." />
        <SettingsLink to="/billing" icon="card" title="Plan & billing" description="Subscription, payment methods and billing history." />
      </div>
    </section>

    <section className="settings-panel" id="settings-panel-workspace" role="tabpanel" aria-labelledby="settings-tab-workspace" hidden={section !== 'workspace'}>
      <div className="settings-group-heading"><h2>Your workspace</h2><p>Notifications, language and index information.</p></div>
      <div className="settings-link-list"><SettingsLink to="/notifications" icon="bell" title="Notifications" description="Review updates and manage unread notifications." /></div>
      <div className="settings-group settings-controls-group">
        <SettingsRow title="Workspace language" description="Search queries and results keep their original language."><span className="settings-static-value">English</span></SettingsRow>
        <SettingsRow title={mode === 'demo' ? 'Demo workspace' : 'Connection'} description={mode === 'demo' ? 'Explore sample data. Changes reset when you reload.' : connectionStatus === 'open' ? 'Your workspace is up to date.' : connectionStatus === 'connecting' ? 'Connecting to your workspace…' : 'Check the connection to continue using your workspace.'}>
          {mode === 'demo' ? <Badge>Sample data</Badge> : <div className="settings-connection-actions"><span className={`settings-connection-state${connectionStatus === 'open' ? ' is-connected' : ''}`}>{connectionStatus === 'open' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting' : 'Offline'}</span><Button variant="secondary" size="sm" loading={checkingConnection} onClick={async () => { setCheckingConnection(true); try { await refreshSession(); toast('Connection checked.', 'success'); } catch (error) { toast(errorMessage(error), 'error'); } finally { setCheckingConnection(false); } }}>Check connection</Button></div>}
        </SettingsRow>
      </div>
      <IndexStatistics />
    </section>
  </div>;
}
