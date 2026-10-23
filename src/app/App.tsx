import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from './AppShell';
import { AuthPage } from '../features/auth/AuthPage';
import { SearchPage } from '../features/search/SearchPage';
import { SavedQueriesPage } from '../features/search/SavedQueriesPage';
import { ShareSearchPage } from '../features/search/ShareSearchPage';
import { HostPage } from '../features/hosts/HostPage';
import { AccountPage } from '../features/account/AccountPage';
import { ApiPage } from '../features/account/ApiPage';
import { BillingPage } from '../features/billing/BillingPage';
import { ScannerPage } from '../features/scanner/ScannerPage';
import { FilesPage } from '../features/files/FilesPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { EmptyState, Button } from '../components/ui';
import { useApp } from './AppProvider';

class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Never send account/query data to an unconfigured telemetry service. */ }
  render() { return this.state.failed ? <div style={{ padding: 32 }}><EmptyState title="This view could not be displayed" description="Reload the page to restore the interface. No operation is automatically repeated." actions={<Button onClick={() => window.location.reload()}>Reload application</Button>} /></div> : this.props.children; }
}
export function App() {
  const location = useLocation();
  const { session } = useApp();
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  if (session.status === 'pending-2fa' && location.pathname !== '/auth/totp') return <Navigate to="/auth/totp" replace />;
  if (location.pathname === '/login') return <Navigate to={`/auth/login${location.search}`} replace />;
  return <ScreenBoundary key={location.pathname}><Routes><Route path="/auth/*" element={<AuthPage />} /><Route element={<AppShell collapsed={navigationCollapsed} onCollapsedChange={setNavigationCollapsed} />}><Route index element={<Navigate to="/search" replace />} /><Route path="/search" element={<SearchPage />} /><Route path="/search/saved" element={<SavedQueriesPage />} /><Route path="/search/share" element={<ShareSearchPage />} /><Route path="/hosts/:identifier" element={<HostPage />} /><Route path="/private/search" element={<SearchPage />} /><Route path="/private/hosts/:identifier" element={<HostPage />} /><Route path="/scanner/*" element={<ScannerPage />} /><Route path="/files" element={<FilesPage />} /><Route path="/api" element={<ApiPage />} /><Route path="/billing/*" element={<BillingPage />} /><Route path="/account/*" element={<AccountPage />} /><Route path="/notifications" element={<NotificationsPage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="*" element={<EmptyState title="This page has moved" description="The address does not match a workspace view. Your account and saved queries are still available." actions={<Link className="button button--primary" to="/search">Back to search</Link>} />} /></Route></Routes></ScreenBoundary>;
}
