import { Component, lazy, Suspense, useState, type ErrorInfo, type ReactNode } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { AppShell } from './AppShell';
import { NavigationEffects } from './NavigationEffects';
import { SearchPage } from '../features/search/SearchPage';
import { EmptyState, Button, Skeleton } from '../components/ui';
import { useApp } from './AppProvider';
import { safeReturnPath } from '../features/auth/auth-state';

const AuthPage = lazy(() => import('../features/auth/AuthPage').then(module => ({ default: module.AuthPage })));
const SavedQueriesPage = lazy(() => import('../features/search/SavedQueriesPage').then(module => ({ default: module.SavedQueriesPage })));
const ShareSearchPage = lazy(() => import('../features/search/ShareSearchPage').then(module => ({ default: module.ShareSearchPage })));
const HostPage = lazy(() => import('../features/hosts/HostPage').then(module => ({ default: module.HostPage })));
const AccountPage = lazy(() => import('../features/account/AccountPage').then(module => ({ default: module.AccountPage })));
const ApiPage = lazy(() => import('../features/account/ApiPage').then(module => ({ default: module.ApiPage })));
const BillingPage = lazy(() => import('../features/billing/BillingPage').then(module => ({ default: module.BillingPage })));
const ScannerPage = lazy(() => import('../features/scanner/ScannerPage').then(module => ({ default: module.ScannerPage })));
const FilesPage = lazy(() => import('../features/files/FilesPage').then(module => ({ default: module.FilesPage })));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage').then(module => ({ default: module.NotificationsPage })));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then(module => ({ default: module.SettingsPage })));

class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* No account or query data is sent to an unconfigured telemetry service. */ }
  render() {
    return this.state.failed ? <EmptyState title="This view could not be displayed" description="Reload this view or return to search."
      actions={<><Link to="/search" className="button button--secondary">Back to search</Link><Button onClick={() => window.location.reload()}>Reload view</Button></>} /> : this.props.children;
  }
}

function RouteLoading() { return <div className="route-loading"><Skeleton rows={5} label="Loading workspace" /></div>; }
function WorkspaceView() {
  const { pathname } = useLocation();
  const workspaceKey = pathname === '/account' || pathname.startsWith('/account/') ? '/account' : pathname;
  return <ScreenBoundary key={workspaceKey}><Suspense fallback={<RouteLoading />}><Outlet /></Suspense></ScreenBoundary>;
}

export function App() {
  const location = useLocation();
  const { session } = useApp();
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  if (session.status === 'pending-2fa' && location.pathname !== '/auth/totp') {
    const authEntry = location.pathname === '/auth' || location.pathname.startsWith('/auth/') || location.pathname === '/login';
    const params = new URLSearchParams(location.search);
    const requested = authEntry ? params.get('returnTo') ?? params.get('next') ?? location.state?.returnTo : `${location.pathname}${location.search}${location.hash}`;
    const returnTo = safeReturnPath(requested);
    return <Navigate to={`/auth/totp${returnTo !== '/search' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} replace />;
  }
  if (location.pathname === '/login') return <Navigate to={`/auth/login${location.search}`} state={location.state} replace />;
  return <><NavigationEffects /><Routes>
    <Route path="/auth/*" element={<ScreenBoundary key={location.pathname}><Suspense fallback={<RouteLoading />}><AuthPage /></Suspense></ScreenBoundary>} />
    <Route element={<AppShell collapsed={navigationCollapsed} onCollapsedChange={setNavigationCollapsed} />}>
      <Route element={<WorkspaceView />}>
        <Route index element={<Navigate to="/search" replace />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/search/saved" element={<SavedQueriesPage />} />
        <Route path="/search/share" element={<ShareSearchPage />} />
        <Route path="/hosts/:identifier" element={<HostPage />} />
        <Route path="/private/search" element={<SearchPage />} />
        <Route path="/private/hosts/:identifier" element={<HostPage />} />
        <Route path="/scanner/*" element={<ScannerPage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/api" element={<ApiPage />} />
        <Route path="/billing/*" element={<BillingPage />} />
        <Route path="/account/*" element={<AccountPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<EmptyState title="This page has moved" description="The address does not match a workspace view. Your account and saved queries are still available." actions={<Link className="button button--primary" to="/search">Back to search</Link>} />} />
      </Route>
    </Route>
  </Routes></>;
}
