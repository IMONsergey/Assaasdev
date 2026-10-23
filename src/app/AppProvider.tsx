import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, createApiClient, type ApiClient, type ConnectionStatus, type Profile, type ResponseMetadata } from '../api';
import { config } from '../config';
import { createDemoApi } from '../demo';

export type SessionStatus = 'loading' | 'anonymous' | 'guest' | 'authenticated' | 'pending-2fa' | 'error';
export interface Session { status: SessionStatus; user: Profile | null; error?: string }
export interface Preferences { theme: 'light' | 'dark' | 'system'; density: 'comfortable' | 'compact'; language: 'en' | 'ru'; fontScale: 100 | 112 | 125; reducedMotion: boolean }
interface Toast { id: string; message: string; tone: 'success' | 'error' | 'info' }
interface AppContextValue {
  api: ApiClient; session: Session; user: Profile | null; refreshSession: () => Promise<void>; setPending2fa: () => void;
  logout: () => Promise<void>; startGuest: () => Promise<void>; toast: (message: string, tone?: Toast['tone']) => void;
  preferences: Preferences; setPreferences: (value: Partial<Preferences>) => void; mode: 'live' | 'demo'; connectionStatus: ConnectionStatus;
  metadata: ResponseMetadata | null; unreadCount: number; highLoad: string | null;
}
const AppContext = createContext<AppContextValue | null>(null);
const api = config.dataMode === 'demo' ? createDemoApi() : createApiClient({ apiBaseUrl: config.apiBaseUrl, wsUrl: config.wsUrl });
const PREFS_KEY = 'apcosys.view.v1';
const defaults: Preferences = { theme: 'light', density: 'comfortable', language: 'en', fontScale: 100, reducedMotion: false };
function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    const savedTheme = ['light', 'dark', 'system'].includes(value.theme) ? value.theme : defaults.theme;
    // The previous default was automatically persisted as System. Migrate that legacy default once.
    const theme = savedTheme === 'system' && value.appearanceVersion !== 2 ? defaults.theme : savedTheme;
    return { theme, density: value.density === 'compact' ? 'compact' : 'comfortable', language: 'en', fontScale: [100, 112, 125].includes(value.fontScale) ? value.fontScale : 100, reducedMotion: value.reducedMotion === true };
  } catch { return defaults; }
}
export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session>({ status: 'loading', user: null });
  const [preferences, updatePreferences] = useState<Preferences>(readPreferences);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(api.getConnectionStatus());
  const [metadata, setMetadata] = useState<ResponseMetadata | null>(null);
  const [unreadCount, setUnreadCount] = useState(0), [highLoad, setHighLoad] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const identity = useRef<string | null>(null), balanceTimestamp = useRef(0), pending = useRef(false);
  const activeSessionRequest = useRef<Promise<void> | null>(null);
  const setPreferences = useCallback((partial: Partial<Preferences>) => updatePreferences(previous => ({ ...previous, ...partial })), []);
  const toast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = crypto.randomUUID();
    const limit = window.matchMedia('(max-width: 760px)').matches ? 2 : 4;
    setToasts(previous => [...previous.filter(item => item.message !== message).slice(-(limit - 1)), { id, message, tone }]);
    window.setTimeout(() => setToasts(previous => previous.filter(item => item.id !== id)), tone === 'error' ? 10000 : 6000);
  }, []);
  const adopt = useCallback((user: Profile | null, status: SessionStatus) => {
    const nextIdentity = user?.user_id ?? (status === 'guest' ? 'guest' : null);
    if (identity.current !== nextIdentity) { queryClient.clear(); setMetadata(null); setUnreadCount(0); setHighLoad(null); balanceTimestamp.current = 0; }
    identity.current = nextIdentity;
    setSession({ status, user });
  }, [queryClient]);
  const refreshSession = useCallback(() => {
    if (activeSessionRequest.current) return activeSessionRequest.current;
    const request = (async () => {
      try {
        const user = await api.http<Profile>('/whoami');
        if (!user || typeof user !== 'object' || (!user.user_id && user.user_type !== 'GUEST')) throw new Error('The API returned an unexpected account response. Check the configured endpoint.');
        pending.current = false;
        adopt(user, user.user_type === 'GUEST' ? 'guest' : 'authenticated');
        void api.connect().catch(() => undefined);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) { pending.current = pending.current || /requires 2fa verification/i.test(error.message); adopt(null, pending.current ? 'pending-2fa' : 'anonymous'); return; }
        setSession(previous => ({ ...previous, status: previous.user ? previous.status : 'error', error: error instanceof Error ? error.message : 'Unable to connect to the API.' }));
        throw error;
      }
    })().finally(() => { activeSessionRequest.current = null; });
    activeSessionRequest.current = request;
    return request;
  }, [adopt]);
  const setPending2fa = useCallback(() => { pending.current = true; api.disconnect(); adopt(null, 'pending-2fa'); }, [adopt]);
  const logout = useCallback(async () => { await api.http('/auth/logout', { method: 'GET', mutation: true }); api.disconnect(); pending.current = false; adopt(null, 'anonymous'); }, [adopt]);
  const guestInFlight = useRef(false);
  const startGuest = useCallback(async () => {
    if (guestInFlight.current) return;
    if (identity.current && identity.current !== 'guest') throw new Error('Sign out before starting a guest session.');
    guestInFlight.current = true;
    try {
      await api.http('/auth/guest', { method: 'POST', body: {}, mutation: true });
      pending.current = false;
      // Some website deployments intentionally disable guest /whoami; the explicit guest creation is still valid.
      let user: Profile = { user_type: 'GUEST', subscription: { type: 'Guest' } };
      try { const profile = await api.http<Profile>('/whoami'); if (profile?.user_type === 'GUEST') user = profile; } catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error; }
      adopt(user, 'guest');
      await api.connect();
    } finally { guestInFlight.current = false; }
  }, [adopt]);
  useEffect(() => { void refreshSession().catch(() => undefined); return () => api.disconnect(); }, [refreshSession]);
  useEffect(() => api.subscribeConnection(setConnectionStatus), []);
  useEffect(() => api.subscribe(frame => {
    if (frame.metadata && frame.context?.principal === 'account') {
      const meta = frame.metadata;
      setMetadata(previous => ({ ...previous, ...meta }));
      if (meta.auth_required) setSession(previous => ({ ...previous, error: 'Your session or guest quota needs attention. Sign in to continue.' }));
      if (meta.credits !== undefined && (meta.timestamp ?? 0) >= balanceTimestamp.current) {
        balanceTimestamp.current = meta.timestamp ?? balanceTimestamp.current;
        setSession(previous => previous.user ? { ...previous, user: { ...previous.user, credits: meta.credits } } : previous);
      }
      if (meta.guest_access) setSession(previous => previous.status === 'guest' && previous.user ? { ...previous, user: { ...previous.user, daily_search_limit: meta.guest_access!.daily_limit, remaining_daily_searches: meta.guest_access!.remaining_daily_searches } } : previous);
    }
    if (frame.type === 'unread_notifications' || frame.type === 'get_notifications') { const data = frame.data as { unread_count?: number } | undefined; if (typeof data?.unread_count === 'number') setUnreadCount(data.unread_count); }
    if (frame.type === 'high_load_status') { const data = frame.data as { enabled?: boolean; message?: string } | undefined; setHighLoad(data?.enabled ? data.message || 'Search is taking longer than usual.' : null); }
  }), []);
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...preferences, appearanceVersion: 2 })); } catch { /* Preferences also work when browser storage is unavailable. */ }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { const element = document.documentElement; element.dataset.theme = preferences.theme === 'system' ? media.matches ? 'dark' : 'light' : preferences.theme; element.dataset.density = preferences.density; element.dataset.reducedMotion = String(preferences.reducedMotion); element.style.setProperty('--font-scale', String(preferences.fontScale / 100)); element.lang = 'en'; };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [preferences]);
  const value = useMemo<AppContextValue>(() => ({ api, session, user: session.user, refreshSession, setPending2fa, logout, startGuest, toast, preferences, setPreferences, mode: config.dataMode, connectionStatus, metadata, unreadCount, highLoad }), [session, refreshSession, setPending2fa, logout, startGuest, toast, preferences, setPreferences, connectionStatus, metadata, unreadCount, highLoad]);
  return <AppContext.Provider value={value}>{children}<div className="toast-region" aria-live="polite" aria-relevant="additions">{toasts.map(item => <div key={item.id} className={`toast toast--${item.tone}`}><span>{item.message}</span><button aria-label="Dismiss notification" onClick={() => setToasts(previous => previous.filter(t => t.id !== item.id))}>×</button></div>)}</div></AppContext.Provider>;
}
export function useApp() { const context = useContext(AppContext); if (!context) throw new Error('useApp must be inside AppProvider'); return context; }
