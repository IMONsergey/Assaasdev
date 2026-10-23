export interface RuntimeConfig { apiBaseUrl?: string; wsUrl?: string; dataMode?: 'live' | 'demo'; basePath?: string }
declare global { interface Window { __APCOSYS_CONFIG__?: RuntimeConfig } }

const runtime = typeof window !== 'undefined' ? window.__APCOSYS_CONFIG__ ?? {} : {};
export const config = {
  apiBaseUrl: runtime.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? '/backend',
  wsUrl: runtime.wsUrl ?? import.meta.env.VITE_WS_URL ?? '',
  dataMode: (runtime.dataMode ?? import.meta.env.VITE_DATA_MODE ?? 'live') as 'live' | 'demo',
  basePath: runtime.basePath ?? import.meta.env.BASE_URL ?? '/',
};

export function asset(path: string): string { return `${config.basePath.replace(/\/$/, '')}/assets/${path.replace(/^\//, '')}`; }

export function safeExternalUrl(value: string): string | null {
  try { const u = new URL(value, window.location.origin); return u.protocol === 'https:' || (u.origin === window.location.origin && u.protocol === 'http:') ? u.href : null; } catch { return null; }
}
