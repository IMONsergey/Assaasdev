import { useMemo, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../app/AppProvider';
import { Badge, Button, Dialog, EmptyState, Field, Icon, PageHeader, SelectField, Skeleton } from '../../components/ui';
import { CodeCanvas } from '../../components/CodeCanvas';
import { ToastRegion } from '../../components/ToastRegion';
import { historyHref, HISTORY_DAYS, HISTORY_LIMIT, searchHistoryStore, type SearchHistoryEntry } from './history-store';
import { queryLabel } from './model';
import './search.css';
import './history.css';

const DAY = 86_400_000;
const PAGE_SIZE = 20;
function periodGroup(timestamp: number, now: number) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (timestamp >= today.getTime()) return 'Today';
  if (timestamp >= yesterday.getTime()) return 'Yesterday';
  return timestamp >= now - 7 * DAY ? 'Previous 7 days' : 'Earlier';
}

function HistoryWorkspace({ userId }: { userId: string }) {
  const store = useMemo(() => searchHistoryStore(userId), [userId]);
  const history = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const queryClient = useQueryClient(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const needle = params.get('q') || '';
  const scope = ['public', 'private'].includes(params.get('scope') || '') ? params.get('scope')! : 'all';
  const period = ['7', '30'].includes(params.get('period') || '') ? params.get('period')! : '90';
  const newSearch = params.get('dataset') === 'private' ? '/private/search' : '/search';
  const [limit, setLimit] = useState(PAGE_SIZE), [clearOpen, setClearOpen] = useState(false);
  const [undo, setUndo] = useState<SearchHistoryEntry[]>([]);
  const [historyState, setHistoryState] = useState('idle');
  const now = Date.now();
  const matching = history.entries.filter(entry => (scope === 'all' || entry.dataset === scope) && entry.lastRunAt >= now - Number(period) * DAY && (!needle.trim() || `${queryLabel(entry.request)} ${JSON.stringify(entry.request)}`.toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase())));
  const groups = new Map<string, SearchHistoryEntry[]>();
  for (const entry of matching.slice(0, limit)) {
    const group = periodGroup(entry.lastRunAt, now);
    groups.set(group, [...(groups.get(group) || []), entry]);
  }
  function setFilter(key: string, value: string, empty: string) {
    const next = new URLSearchParams(window.location.search);
    if (value === empty) next.delete(key); else next.set(key, value);
    setLimit(PAGE_SIZE); setParams(next, { replace: true, state: { preserveTabFocus: true } });
  }
  function keepUndo(removed: SearchHistoryEntry[], keyboard = false) {
    setUndo(current => [...current, ...removed.filter(entry => !current.some(item => item.id === entry.id))]);
    if (keyboard) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-onboarding="history-undo"]')?.focus({ preventScroll: true }));
  }
  function restoreRemoved(keyboard = false) {
    const last = undo.at(-1);
    store.restore(undo); setUndo([]); setHistoryState('restored');
    if (keyboard) requestAnimationFrame(() => {
      const restored = last ? document.querySelector<HTMLAnchorElement>(`[data-history-id="${last.id}"] .search-history-title`) : null;
      (restored || document.querySelector<HTMLInputElement>('.search-history-find input'))?.focus({ preventScroll: true });
    });
  }
  function run(entry: SearchHistoryEntry) {
    // Invalidate without fetching. Mounting SearchPage performs this one explicit request,
    // including when this exact query already has a cached response.
    void queryClient.invalidateQueries({ queryKey: ['search', userId, entry.dataset, entry.request], exact: true, refetchType: 'none' });
    navigate(historyHref(entry, false));
  }
  function clearFilters() {
    const next = new URLSearchParams(window.location.search); next.delete('q'); next.delete('scope'); next.delete('period');
    setLimit(PAGE_SIZE); setParams(next, { replace: true, state: { preserveTabFocus: true } });
  }

  return <div className="search-history-page stack" data-onboarding="search-history" data-ready="true" data-onboarding-state={historyState}>
    <PageHeader title="Search history" actions={<Link className="search-secondary-link" to={newSearch}><Icon name="plus" size={16} />New search</Link>} />
    <div className="search-history-management">
      <label className="search-history-toggle"><input type="checkbox" role="switch" checked={history.enabled} onChange={event => store.setEnabled(event.target.checked)} /><span>Save history</span></label>
      <p>{history.persistent ? `Only on this browser · Up to ${HISTORY_LIMIT} searches for ${HISTORY_DAYS} days` : 'Available for this page session · Browser storage is unavailable'}</p>
      <Button variant="ghost" size="sm" data-onboarding="history-clear" disabled={history.entries.length === 0} onClick={() => setClearOpen(true)}><Icon name="trash" size={16} />Clear history</Button>
    </div>
    <div className="search-history-toolbar">
      <Field label="Find a search" className="search-history-find" type="search" value={needle} onChange={event => setFilter('q', event.target.value, '')} placeholder="Search text or conditions" icon={<Icon name="search" size={18} />} />
      <SelectField label="Scope" value={scope} onChange={event => setFilter('scope', event.target.value, 'all')}><option value="all">All</option><option value="public">Public</option><option value="private">Private</option></SelectField>
      <SelectField label="Period" value={period} onChange={event => setFilter('period', event.target.value, '90')}><option value="90">90 days</option><option value="30">30 days</option><option value="7">7 days</option></SelectField>
    </div>
    {history.entries.length === 0 ? <EmptyState icon={<Icon name="clock" size={28} />} title={history.enabled ? 'No recent searches' : 'History is paused'} description={history.enabled ? 'Your submitted searches will appear here.' : 'Turn on Save history to keep future searches.'} actions={<Link className="search-secondary-link" to={newSearch}>Start a search<Icon name="arrow" size={16} /></Link>} /> : matching.length === 0 ? <EmptyState icon={<Icon name="search" size={28} />} title="No matching searches" actions={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>} /> : <>
      <div className="search-history-count" role="status">{matching.length} {matching.length === 1 ? 'search' : 'searches'}{!history.enabled && <Badge>Saving paused</Badge>}</div>
      <div className="search-history-groups" data-onboarding="search-history-list">{[...groups].map(([group, entries]) => <section className="search-history-group" key={group} aria-label={group}><h2>{group}</h2><div className="search-history-list">{entries.map(entry => {
        const label = queryLabel(entry.request), time = new Date(entry.lastRunAt);
        return <article className="search-history-row" key={entry.id} data-history-id={entry.id}>
          <div className="search-history-mark"><Icon name={entry.dataset === 'private' ? 'scan' : 'search'} size={19} /></div>
          <div className="search-history-content"><Link className="search-history-title" to={historyHref(entry)} title={label}>{label}</Link><div className="search-history-meta"><span><Icon name={entry.dataset === 'private' ? 'lock' : 'globe'} size={13} />{entry.dataset === 'private' ? 'Private scans' : 'Public internet'}</span>{entry.request.task_ids?.length ? <span>{entry.request.task_ids.length} scan {entry.request.task_ids.length === 1 ? 'task' : 'tasks'}</span> : null}<time dateTime={time.toISOString()} title={time.toLocaleString()}>{group === 'Today' || group === 'Yesterday' ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : time.toLocaleDateString([], { month: 'short', day: 'numeric' })}</time></div>
            <details className="search-history-conditions"><summary>View conditions</summary><CodeCanvas content={JSON.stringify(entry.request, null, 2)} language="json" title="Search conditions" /></details>
          </div>
          <div className="search-history-actions"><Link className="search-history-restore" data-onboarding="history-restore" to={historyHref(entry)}>Restore</Link><Button variant="secondary" size="sm" data-onboarding="history-run" onClick={() => run(entry)} aria-label={`Run search: ${label}`}><Icon name="arrow" size={16} />Run</Button><Button variant="ghost" size="sm" className="icon-button" aria-label={`Delete search: ${label}`} onClick={event => { keepUndo(store.remove([entry.id]), event.detail === 0); setHistoryState('deleted'); }}><Icon name="trash" size={17} /></Button></div>
        </article>;
      })}</div></section>)}</div>
      {matching.length > limit && <div className="search-history-more"><Button variant="secondary" onClick={() => setLimit(current => current + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, matching.length - limit)} more<Icon name="chevron-down" size={16} /></Button><span>Showing {Math.min(limit, matching.length)} of {matching.length}</span></div>}
    </>}
    <Dialog open={clearOpen} onClose={() => setClearOpen(false)} title="Clear search history?" size="sm" className="search-history-clear-dialog" footer={<><Button variant="secondary" onClick={() => setClearOpen(false)}>Cancel</Button><Button variant="danger" data-onboarding="history-confirm-clear" onClick={event => { keepUndo(store.clear(), event.detail === 0); setClearOpen(false); setHistoryState('cleared'); }}>Clear history</Button></>}><p>Remove {history.entries.length} {history.entries.length === 1 ? 'search' : 'searches'} from this account on this browser.</p></Dialog>
    <ToastRegion visible={undo.length > 0}>{undo.length > 0 && <div className="toast toast--info search-history-undo" role="status"><Icon name="check" size={19} /><span>{undo.length === 1 ? 'Search removed.' : `${undo.length} searches removed.`}</span><Button variant="ghost" size="sm" data-onboarding="history-undo" onClick={event => restoreRemoved(event.detail === 0)}>Undo</Button><button type="button" aria-label="Dismiss history notification" onClick={() => setUndo([])}><Icon name="close" size={16} /></button></div>}</ToastRegion>
  </div>;
}

export function SearchHistoryPage() {
  const { user, session } = useApp();
  if (session.status === 'loading') return <Skeleton rows={5} label="Loading search history" />;
  if (session.status !== 'authenticated' || !user?.user_id || user.user_id.length > 256) return <div className="search-history-page stack"><PageHeader title="Search history" /><EmptyState icon={<Icon name="clock" size={28} />} title="Keep your recent searches together" description="Sign in to save history for your account on this browser." actions={<Link className="button button--primary" to="/auth/login?returnTo=%2Fsearch%2Fhistory">Sign in</Link>} /></div>;
  return <HistoryWorkspace key={user.user_id} userId={user.user_id} />;
}
