# Frontend integration contract

Source: APCOSYS website API supplied 22 October 2026; canonical Figma application page899:3620 and release23.10. Existing backend owns authentication, permissions, billing, indexing and scanning.

## Shared application context

Import `useApp` from `../../app/AppProvider` (adjust relative path). It returns:

- `api: ApiClient` from `src/api`.
- `session: { status: 'loading'|'anonymous'|'guest'|'authenticated'|'pending-2fa'|'error'; user: Profile|null; error?: string }`.
- `user: Profile|null` alias.
- `refreshSession(): Promise<void>`; `setPending2fa(): void`; `logout(): Promise<void>`; `startGuest(): Promise<void>`.
- `toast(message: string, tone?: 'success'|'error'|'info'): void`.
- `preferences: { theme: 'light'|'dark'|'system'; density: 'comfortable'|'compact'; language: 'en'|'ru'; fontScale: 100|112|125; reducedMotion: boolean }`; `setPreferences(partial): void`. Only English is currently implemented and selectable.
- `mode: 'live'|'demo'`; `connectionStatus: ConnectionStatus`.
- `metadata: ResponseMetadata|null`; `unreadCount: number`; `highLoad: string|null`. Shared-link metadata is excluded from account balances using client-assigned request provenance.

No profile, cookie, API key, recovery code or query cache is persisted to localStorage. Only view preferences may persist. Demo is an explicit separate adapter and visibly labeled; live never falls back to it.

## Shared UI, `src/components/ui.tsx`

- `Button`: native button props + `variant` primary/secondary/accent/danger/ghost; `size` sm/md; `loading`; `fullWidth`.
- `Field`: input props + label/hint/error; optional icon ReactNode. `TextArea` equivalent. `SelectField`: native select props + label/hint/error, children options.
- `Checkbox`: native input props + label/hint.
- `PageHeader`: title, eyebrow?, description?, actions?. `Card`: children/className.
- `Alert`: tone error/warning/success/info, title?, children, actions?.
- `Badge`: tone neutral/accent/success/warning/error, children.
- `Dialog`: open,onClose,title,children,footer?,size sm/md/lg.
- `ConfirmDialog`: open,onClose,onConfirm,title,description,confirmLabel?,danger?,busy?,confirmDisabled?.
- `EmptyState`: title,description?,icon?,actions?. `Spinner`: label?.
- `Tabs`: items {id,label,count?}[],value,onChange.
- `Pagination`: page,pageSize,count (received count),total?,maxPage?,onPageChange.
- `Icon`: name (string),size?,className; first-party assets used where available.

Global CSS vars: --bg,--nav,--surface,--surface-hover,--text,--muted,--line,--accent,--accent-text,--tint,--danger,--success,--warning,--radius,--font-ui,--font-display,--font-mono. Generic helpers: .stack,.cluster,.muted,.mono,.split-grid,.table-wrap,.data-table,.form-grid,.form-actions,.section-title,.inline-link. Comfortable/compact and light/dark use same semantic tokens.

## Routes

`/search`, `/search/saved`, `/search/share`, `/hosts/:identifier`, `/private/search`, `/private/hosts/:identifier`, `/scanner`, `/scanner/new`, `/files`, `/api`, `/billing`, `/billing/return`, `/account`, `/account/security`, `/account/sessions`, `/account/team`, `/notifications`, `/settings`.

Auth: `/auth/login`, `/auth/signup`, `/auth/verify`, `/auth/totp`, `/auth/recovery`, `/auth/recovery/confirm`, `/auth/callback`.

Search domain exports SearchPage, SavedQueriesPage, ShareSearchPage. Host exports HostPage. Identity exports AuthPage, AccountPage, ApiPage; billing exports BillingPage. Route variants may use useLocation. Main application remains usable with a selected guest session for public search; protected actions state the required access.

## Query policy

TanStack Query defaults: retry=false, refetchOnWindowFocus=false, refetchOnReconnect=false, staleTime=60s, no persistence. Search is explicit; re-render, tab focus and reconnect must not silently bill another query. Mutations never auto-retry. Unknown outcome is separate from rejection; reconcile before retry. Use id-correlated stream for multipart results; private_hostinfo is isolated because contract includes uncorrelated responses.
