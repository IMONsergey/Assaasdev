import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, isApiError, type PlanningTask, type PrivateTask, type PrivateTaskRequest } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Checkbox, Dialog, EmptyState, Field, Icon, PageHeader, Pagination, SelectField, Skeleton, TabPanel, Tabs } from '../../components/ui';
import { CodeCanvas } from '../../components/CodeCanvas';
import { ExportDialog } from '../files/ExportDialog';
import { dateLabel, encodeSearch } from '../search/model';
import { buildScanRequest, draftFromTask, EMPTY_SCAN_DRAFT, sameScope, scheduleLabel, taskGroup, taskHasResults, taskProgress, taskResultsLabel, type ScanDraft, type ScanErrors } from './model';
import { ScanEstimate, ScanFields, ScanReview } from './ScanForm';
import './scanner.css';

type ScanAction = { kind: 'create' | 'update' | 'remove-task' | 'remove-plan' | 'delete-results'; ids: string[]; request?: PrivateTaskRequest; draft?: ScanDraft; knownIds?: string[]; baselineLoaded?: boolean };
type TaskLike = PrivateTask | PlanningTask;

const actionTitle = (action: ScanAction) => ({ create: 'Review scan task', update: 'Review task changes', 'remove-task': 'Delete this task?', 'remove-plan': 'Remove scheduled task?', 'delete-results': 'Delete stored results?' })[action.kind];
const actionLabel = (action: ScanAction) => ({ create: 'Create scan task', update: 'Update task', 'remove-task': 'Delete task', 'remove-plan': 'Remove scheduled task', 'delete-results': 'Delete results' })[action.kind];

function ScopeText({ task }: { task: TaskLike }) {
  const targets = [...(task.host_list || []), ...(task.cidr_list || [])];
  return <><strong className="scanner-target-primary">{targets[0] || 'Targets not provided'}{targets.length > 1 && <span> +{targets.length - 1}</span>}</strong><span className="scanner-task-caption">Ports {task.port_list?.length ? task.port_list.slice(0, 8).join(', ') + (task.port_list.length > 8 ? ` +${task.port_list.length - 8} more` : '') : 'not provided'} · {task.id}</span></>;
}

function ScheduleText({ schedule }: { schedule: string | undefined }) {
  return <span className="scanner-schedule-text"><span>{scheduleLabel(schedule)}</span>{schedule && <code>{schedule}</code>}</span>;
}

function Progress({ task, showStatus = true }: { task: PrivateTask; showStatus?: boolean }) {
  const progress = taskProgress(task), group = taskGroup(task.status);
  const failed = ['failed', 'error'].includes((task.status || '').toLowerCase());
  const cancelled = ['cancelled', 'canceled'].includes((task.status || '').toLowerCase());
  return <div className={`scanner-progress scanner-progress-${group}${failed ? ' scanner-progress--error' : cancelled ? ' scanner-progress--cancelled' : ''}`}><span className="scanner-progress-label"><span className="scanner-progress-status">{showStatus ? task.status || 'Status not provided' : 'Checks'}</span>{task.done_task_count !== undefined && task.task_count !== undefined && <span className="scanner-progress-count">{task.done_task_count.toLocaleString()} / {task.task_count.toLocaleString()}</span>}</span>{progress !== undefined && <progress value={progress} max="100" aria-label={`${task.id} completed checks`}>{progress}%</progress>}</div>;
}

export function ScannerPage() {
  const { api, user, session, metadata, toast, refreshSession } = useApp();
  const queryClient = useQueryClient(), location = useLocation(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const creating = location.pathname.endsWith('/new');
  const principal = user?.user_id || user?.session_id || session.status;
  const taskKey = ['private-tasks', principal], planKey = ['private-planned-tasks', principal];
  const [autoRefresh, setAutoRefresh] = useState(false);
  const canRead = session.status === 'authenticated';
  const tasks = useQuery({ queryKey: taskKey, enabled: canRead, refetchInterval: autoRefresh && !creating ? 15_000 : false, queryFn: async ({ signal }) => {
    const frame = await api.request<PrivateTask[]>('private_tasks_get', {}, { signal, responseTypes: ['private_tasks_get'] });
    if (!Array.isArray(frame.data) || frame.data.some(task => typeof task?.id !== 'string')) throw new Error('The server returned an unexpected task list.');
    return frame.data;
  } });
  const planned = useQuery({ queryKey: planKey, enabled: canRead, refetchInterval: autoRefresh && !creating ? 15_000 : false, queryFn: async ({ signal }) => {
    const frame = await api.request<PlanningTask[]>('private_planning_tasks_get', {}, { signal, responseTypes: ['private_planning_tasks_get'] });
    if (!Array.isArray(frame.data) || frame.data.some(task => typeof task?.id !== 'string')) throw new Error('The server returned an unexpected scheduled-task list.');
    return frame.data;
  } });
  useEffect(() => {
    if (!canRead) return;
    return api.subscribe(frame => {
      if ((frame.type === 'private_tasks_get' || frame.type === 'private_planning_tasks_get') && Array.isArray(frame.data) && frame.data.every(task => typeof task?.id === 'string')) queryClient.setQueryData(frame.type === 'private_tasks_get' ? taskKey : planKey, frame.data);
    });
  }, [api, canRead, principal, queryClient]);
  const canUse = canRead && (user?.subscription?.type === 'Business' || metadata?.full_access === true || tasks.isSuccess || planned.isSuccess);
  const [draft, setDraft] = useState<ScanDraft>({ ...EMPTY_SCAN_DRAFT });
  const [errors, setErrors] = useState<ScanErrors>({});
  const [confirm, setConfirm] = useState<ScanAction | null>(null);
  const [editing, setEditing] = useState<TaskLike | null>(null), [editDraft, setEditDraft] = useState<ScanDraft>({ ...EMPTY_SCAN_DRAFT });
  const [details, setDetails] = useState<TaskLike | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const filter = params.get('q') || '', statusFilter = params.get('status') || '';
  const rows = [10, 25, 50, 100].includes(Number(params.get('rows'))) ? Number(params.get('rows')) : 25;
  const requestedPage = /^\d+$/.test(params.get('page') || '') ? Math.max(1, Number(params.get('page'))) : 1;
  const [exportIds, setExportIds] = useState<string[] | null>(null);
  const [reconcileChecked, setReconcileChecked] = useState(false), [reconcileMessage, setReconcileMessage] = useState(''), [checking, setChecking] = useState(false);
  const [retryNotice, setRetryNotice] = useState('');
  const lastAction = useRef<ScanAction | null>(null);

  async function refreshLists() {
    const [taskResult, planResult] = await Promise.all([tasks.refetch(), planned.refetch()]);
    return { taskResult, planResult, success: taskResult.isSuccess && planResult.isSuccess };
  }
  const operation = useMutation({ mutationFn: async (action: ScanAction) => {
    lastAction.current = action;
    const type = ({ create: 'private_task_add', update: 'private_task_update', 'remove-task': 'private_task_remove', 'remove-plan': 'private_planning_task_remove', 'delete-results': 'private_task_results_delete' })[action.kind];
    const payload = action.kind === 'create' || action.kind === 'update' ? action.request : action.kind === 'delete-results' ? { task_ids: action.ids } : { id: action.ids[0] };
    const frame = await api.request<{ task_id?: string; message?: string }>(type, payload, { mutation: true, responseTypes: [type] });
    if (action.kind === 'create' && !frame.data?.task_id) throw new ApiError('unknown', 'The response did not confirm a task ID. Check the task list before submitting again.', { outcome: 'unknown' });
    if ((action.kind === 'update' || action.kind === 'delete-results') && !frame.data?.message) throw new ApiError('unknown', 'The scanner has not confirmed this change. Check the current task list.', { outcome: 'unknown' });
    return { action, taskId: frame.data?.task_id, message: frame.data?.message };
  }, onSuccess: async result => {
    setConfirm(null); setEditing(null); setRetryNotice(''); setReconcileMessage(''); setReconcileChecked(false);
    if (result.action.kind === 'delete-results') {
      setSelected([]);
      await queryClient.invalidateQueries({ predicate: query => ['search', 'host', 'analytics'].includes(String(query.queryKey[0])) && query.queryKey[2] === 'private', refetchType: 'none' });
    }
    const current = await refreshLists();
    if (result.action.kind === 'create') { setDraft({ ...EMPTY_SCAN_DRAFT }); returnToList(result.taskId!); }
    if ((result.action.kind === 'remove-task' && current.taskResult.isSuccess && current.taskResult.data.some(task => result.action.ids.includes(task.id))) || (result.action.kind === 'remove-plan' && current.planResult.isSuccess && current.planResult.data.some(task => result.action.ids.includes(task.id)))) toast('The server acknowledged the removal, but this ID is still in the refreshed list. Refresh again before repeating it.', 'info');
    else toast(result.action.kind === 'create' ? `Task accepted: ${result.taskId}.` : current.success ? 'Change confirmed. The task lists have been refreshed.' : 'Change confirmed, but the current task list could not be loaded.', current.success ? 'success' : 'info');
    void refreshSession().catch(() => undefined);
  } });
  const unknown = isApiError(operation.error) && operation.error.outcome === 'unknown';
  const busy = operation.isPending;

  function prepare(action: ScanAction) { if (busy || unknown) return; operation.reset(); setRetryNotice(''); setReconcileMessage(''); setReconcileChecked(false); setConfirm(action); }
  function reviewCreate() {
    const built = buildScanRequest(draft); setErrors(built.errors);
    if (!built.valid) return;
    prepare({ kind: 'create', ids: [], request: built.request, draft: { ...draft }, knownIds: [...(tasks.data || []).map(task => task.id), ...(planned.data || []).map(task => task.id)], baselineLoaded: tasks.isSuccess && planned.isSuccess });
  }
  function reviewUpdate() {
    if (!editing) return;
    const built = buildScanRequest(editDraft, editing.id); setErrors(built.errors);
    if (!built.valid) return;
    prepare({ kind: 'update', ids: [editing.id], request: built.request, draft: { ...editDraft } });
  }
  async function reconcile() {
    setChecking(true); setReconcileMessage('');
    try {
      const current = await refreshLists();
      if (!current.success) { setReconcileMessage('Both task lists could not be refreshed. The previous action remains unconfirmed.'); return; }
      const action = lastAction.current || operation.variables;
      let confirmed = false, createdId: string | undefined;
      const all = [...current.taskResult.data!, ...current.planResult.data!];
      if (action?.kind === 'remove-task') confirmed = action.ids.every(id => !current.taskResult.data!.some(task => task.id === id));
      if (action?.kind === 'remove-plan') confirmed = action.ids.every(id => !current.planResult.data!.some(task => task.id === id));
      if (action?.kind === 'delete-results') confirmed = action.ids.every(id => current.taskResult.data!.some(task => task.id === id && (task.result_count === 0 || task.has_results === false)));
      if (action?.kind === 'update' && action.request) confirmed = all.some(task => task.id === action.ids[0] && sameScope(task, action.request!));
      if (action?.kind === 'create' && action.request && action.baselineLoaded) { const found = all.find(task => !action.knownIds?.includes(task.id) && sameScope(task, action.request!)); confirmed = Boolean(found); createdId = found?.id; }
      setReconcileChecked(true);
      if (confirmed) { operation.reset(); setConfirm(null); setEditing(null); setReconcileMessage(''); toast('Task state updated.', 'success'); if (createdId) returnToList(createdId); }
      else setReconcileMessage('The current lists do not confirm the requested change. Review the tasks before deciding whether to submit another request.');
    } finally { setChecking(false); }
  }
  function reviewAgain() { operation.reset(); setConfirm(null); setRetryNotice('The previous outcome was not confirmed. Review the refreshed task list and the scope before making another request.'); }
  const tab = ['all', 'active', 'history', 'planned'].includes(params.get('tab') || '') ? params.get('tab')! : 'all';
  function updateList(values: Record<string, string>, replace = false) {
    // History is synchronous; the router's rendered params can trail a rapid edit.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    if (!('page' in values)) next.delete('page');
    setParams(next, { replace, state: { preserveTabFocus: true } });
    if ('page' in values) requestAnimationFrame(() => document.querySelector('.scanner-tasks-table-wrap')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
  }
  const setFilter = (value: string) => updateList({ q: value }, true);
  const changeTab = (value: string) => updateList({ tab: value, status: '' });
  const scannerReturn = `/scanner${location.search}`;
  const suppliedReturn = params.get('returnTo');
  const backToTasks = suppliedReturn && /^\/scanner(?:\?|$)/.test(suppliedReturn) ? suppliedReturn : '/scanner';
  function returnToList(createdId: string) { const target = new URL(backToTasks, window.location.origin); target.searchParams.set('created', createdId); navigate(target.pathname + target.search); }
  const taskResultsPath = (ids: string[]) => `/private/search?${encodeSearch({ task_ids: ids, page: 1, docs_per_page: 20 })}&scanner_back=${encodeURIComponent(scannerReturn)}`;
  const active = tasks.data?.filter(task => taskGroup(task.status) === 'active') || [], history = tasks.data?.filter(task => taskGroup(task.status) === 'history') || [];
  const statusOptions = useMemo(() => [...new Set((tasks.data || []).map(task => task.status || '__missing__'))].sort(), [tasks.data]);
  const visible = useMemo(() => (tasks.data || []).filter(task => (tab === 'active' ? taskGroup(task.status) === 'active' : tab === 'history' ? taskGroup(task.status) === 'history' : true) && (!statusFilter || (task.status || '__missing__') === statusFilter) && (!filter.trim() || JSON.stringify([task.id, task.host_list, task.cidr_list, task.port_list, task.status]).toLowerCase().includes(filter.trim().toLowerCase()))), [tasks.data, tab, filter, statusFilter]);
  const visiblePlanned = useMemo(() => (planned.data || []).filter(task => !filter.trim() || JSON.stringify([task.id, task.host_list, task.cidr_list, task.port_list, task.user_name, task.schedule]).toLowerCase().includes(filter.trim().toLowerCase())), [planned.data, filter]);
  const matchingCount = tab === 'planned' ? visiblePlanned.length : visible.length;
  const currentPage = Math.min(requestedPage, Math.max(1, Math.ceil(matchingCount / rows)));
  const pagedTasks = visible.slice((currentPage - 1) * rows, currentPage * rows);
  const pagedPlans = visiblePlanned.slice((currentPage - 1) * rows, currentPage * rows);
  const hasListFilters = Boolean(filter || statusFilter);
  const clearListFilters = () => updateList({ q: '', status: '' }, true);
  const selectedCurrent = selected.filter(id => tasks.data?.some(task => task.id === id));
  const fullAllowance = user?.subscription?.scan_credits;
  const knownCreditRatio = user?.scan_credits !== undefined && fullAllowance !== undefined && fullAllowance > 0 ? Math.max(0, Math.min(100, user.scan_credits / fullAllowance * 100)) : undefined;
  const listError = tab === 'planned' ? planned.error : tasks.error;
  const listPending = tab === 'planned' ? planned.isPending : tasks.isPending;
  const toggle = (id: string) => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  function openTaskFromRow(event: MouseEvent<HTMLTableRowElement>, task: TaskLike) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey ||
      (event.target as Element).closest('a, button, input, select, textarea, label, summary') || window.getSelection()?.toString()) return;
    // Keep the native target button as the keyboard entry and dialog return point.
    event.currentTarget.querySelector<HTMLButtonElement>('.scanner-target-button')?.focus({ preventScroll: true });
    setDetails(task);
  }
  const unknownNotice = <Alert tone="warning" title="The previous action is not confirmed" actions={<div className="cluster"><Button variant="secondary" loading={checking} onClick={() => void reconcile()}>Check task list</Button>{reconcileChecked && <Button variant="ghost" disabled={checking} onClick={reviewAgain}>Return to review</Button>}</div>}>{operation.error?.message} This action will not be repeated automatically.{reconcileMessage && <p>{reconcileMessage}</p>}</Alert>;

  return <div className="scanner-page">
    <PageHeader title={creating ? 'New scan task' : 'Private Scanner'} actions={creating ? <Link className="scanner-secondary-link" to={backToTasks}><Icon name="chevron-left" size={17} />Back to tasks</Link> : <Link className="scanner-primary-link" to={`/scanner/new?returnTo=${encodeURIComponent(scannerReturn)}`}><Icon name="plus" size={18} />New task</Link>} />
    {session.status === 'loading' ? <Skeleton rows={4} label="Checking your session" /> : !canRead ? <EmptyState icon={<Icon name="scan" size={26} />} title="Sign in to use Private Scanner" actions={<Link className="button button--primary" to={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link>} /> : !canUse && !tasks.isPending && !planned.isPending ? <EmptyState icon={<Icon name="lock" size={26} />} title="Private scanning requires Business access" actions={<Link className="button button--secondary" to="/billing?section=plans">View plans</Link>} /> : <>
      {unknown && !confirm && unknownNotice}
      {retryNotice && <Alert tone="warning">{retryNotice}</Alert>}
      {!unknown && operation.error && !confirm && <Alert tone="error">{operation.error.message}</Alert>}
      {creating ? <form onSubmit={event => { event.preventDefault(); reviewCreate(); }}>
        <div className="scanner-create-layout"><ScanFields draft={draft} onChange={next => { setDraft(next); setErrors({}); }} errors={errors} disabled={busy || unknown} /><ScanEstimate draft={draft} scanCredits={user?.scan_credits} /></div>
        {errors.form && <Alert tone="error" title="Check the scan targets">{errors.form}</Alert>}
        <div className="scanner-form-actions"><Button type="submit" disabled={!canUse || busy || unknown}>Review task<Icon name="arrow" size={17} /></Button><Link to={backToTasks} className="inline-link">Cancel</Link></div>
      </form> : <>
        <section className="scanner-overview" aria-label="Scanner overview">
          <div><span className="scanner-metric-label"><Icon name="scan" size={18} />Active tasks</span><strong>{tasks.data ? active.length.toLocaleString() : '—'}</strong></div>
          <div><span className="scanner-metric-label"><Icon name="clock" size={18} />Scheduled</span><strong>{planned.data ? planned.data.length.toLocaleString() : '—'}</strong></div>
          <div><span className="scanner-metric-label"><Icon name="database" size={18} />Scan credits</span><strong>{user?.scan_credits !== undefined ? user.scan_credits.toLocaleString() : '—'}</strong>{knownCreditRatio !== undefined && <progress value={knownCreditRatio} max="100" aria-label="Scan credits relative to the included allocation" />}</div>
        </section>
        <div className="scanner-list-heading"><Tabs idPrefix="scanner" ariaLabel="Scanner sections" items={[{ id: 'tasks', label: 'Tasks', icon: 'list', count: tasks.data?.length }, { id: 'planned', label: 'Scheduled', icon: 'clock', count: planned.data?.length }]} value={tab === 'planned' ? 'planned' : 'tasks'} onChange={value => changeTab(value === 'planned' ? 'planned' : 'all')} /><Button variant="secondary" size="sm" loading={tasks.isFetching || planned.isFetching} onClick={() => void refreshLists()}><Icon name="refresh" size={16} />Refresh</Button></div>
        <TabPanel idPrefix="scanner" value={tab === 'planned' ? 'tasks' : 'planned'} hidden>{null}</TabPanel>
        <TabPanel idPrefix="scanner" value={tab === 'planned' ? 'planned' : 'tasks'} className="scanner-list-panel">
          <div className="scanner-view-controls">{tab !== 'planned' ? <Tabs variant="segmented" ariaLabel="Task view" items={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Active', count: tasks.data ? active.length : undefined }, { id: 'history', label: 'History', count: tasks.data ? history.length : undefined }]} value={tab} onChange={changeTab} /> : <h2 className="scanner-list-title">Scheduled tasks</h2>}<Checkbox label="Refresh every 15 seconds" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} /></div>
          <div className={`scanner-list-controls${tab === 'planned' ? ' scanner-list-controls--planned' : ''}`}>
            <Field label="Find a task" icon={<Icon name="search" size={17} />} value={filter} onChange={event => setFilter(event.target.value)} placeholder={tab === 'planned' ? 'Task ID, target, port or owner' : 'Task ID, target or port'} />
            {tab !== 'planned' && <SelectField label="Task status" value={statusFilter} onChange={event => updateList({ status: event.target.value })}><option value="">All statuses</option>{statusOptions.map(status => <option key={status} value={status}>{status === '__missing__' ? 'Status not provided' : status}</option>)}{statusFilter && !statusOptions.includes(statusFilter) && <option value={statusFilter}>{statusFilter}</option>}</SelectField>}
            <SelectField label="Tasks per page" value={rows} onChange={event => updateList({ rows: event.target.value })}>{[10, 25, 50, 100].map(count => <option key={count} value={count}>{count}</option>)}</SelectField>
          </div>
          {selectedCurrent.length > 0 && tab !== 'planned' && <div className="scanner-selection-bar"><strong>{selectedCurrent.length} selected</strong><Link to={taskResultsPath(selectedCurrent)}><Icon name="search" size={16} />View results</Link><Button variant="secondary" size="sm" disabled={busy || unknown} onClick={() => setExportIds(selectedCurrent)}><Icon name="download" size={16} />Export</Button><Button variant="danger" size="sm" disabled={busy || unknown} onClick={() => prepare({ kind: 'delete-results', ids: [...selectedCurrent] })}><Icon name="trash" size={16} />Delete stored results</Button><Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear selection</Button></div>}
          {listPending && <Skeleton rows={6} label={tab === 'planned' ? 'Loading scheduled tasks' : 'Loading scan tasks'} />}
          {listError && <Alert tone="error" title="Tasks could not be loaded" actions={<Button variant="secondary" onClick={() => void refreshLists()}>Try again</Button>}>{listError.message}</Alert>}
          {!listPending && tab === 'planned' && <div className="scanner-tasks-table-wrap" aria-busy={planned.isFetching || undefined}>
            <table className="scanner-task-table scanner-task-table--planned"><thead><tr><th>Targets</th><th>Schedule</th><th>Owner</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{pagedPlans.map(task => <tr key={task.id} className={`scanner-task-row${params.get('created') === task.id ? ' scanner-recent-task' : ''}`} onClick={event => openTaskFromRow(event, task)}><td><button type="button" className="scanner-target-button" aria-haspopup="dialog" onClick={() => setDetails(task)}><ScopeText task={task} /></button></td><td data-label="Schedule"><span className="scanner-schedule-value"><Icon name="clock" size={15} /><ScheduleText schedule={task.schedule} /></span></td><td data-label="Owner">{task.user_name || 'Not provided'}</td><td className="scanner-actions-cell"><div className="scanner-row-actions"><Button variant="ghost" size="sm" disabled={busy || unknown} onClick={() => { setErrors({}); setEditing(task); setEditDraft(draftFromTask(task)); }}><Icon name="edit" size={16} />Edit</Button><Button variant="ghost" size="sm" disabled={busy || unknown} onClick={() => prepare({ kind: 'remove-plan', ids: [task.id] })}><Icon name="trash" size={16} />Remove</Button></div></td></tr>)}</tbody></table>
            {!visiblePlanned.length && !listError && <EmptyState icon={<Icon name="clock" size={24} />} title={hasListFilters ? 'No scheduled tasks match' : 'No scheduled tasks'} actions={hasListFilters ? <Button variant="secondary" onClick={clearListFilters}>Clear task filter</Button> : <Link to={`/scanner/new?returnTo=${encodeURIComponent(scannerReturn)}`} className="scanner-primary-link"><Icon name="plus" size={17} />New scan task</Link>} />}
          </div>}
          {!listPending && tab !== 'planned' && <div className="scanner-tasks-table-wrap" aria-busy={tasks.isFetching || undefined}>
            <table className="scanner-task-table"><thead><tr><th className="scanner-check-column"><span className="sr-only">Select</span></th><th>Targets</th><th>Created</th><th>Status / checks</th><th>Results</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{pagedTasks.map(task => <tr key={task.id} className={`scanner-task-row${params.get('created') === task.id ? ' scanner-recent-task' : ''}`} onClick={event => openTaskFromRow(event, task)}><td className="scanner-select-cell"><input type="checkbox" aria-label={`Select task ${task.id}`} checked={selectedCurrent.includes(task.id)} disabled={busy || unknown} onChange={() => toggle(task.id)} /></td><td><button type="button" className="scanner-target-button" aria-haspopup="dialog" onClick={() => setDetails(task)}><ScopeText task={task} /></button></td><td data-label="Created"><span className="scanner-created-time">{dateLabel(task.created_at)}</span></td><td data-label="Status / checks"><Progress task={task} /></td><td data-label="Results"><span className="scanner-result-count">{taskResultsLabel(task)}</span><Link className="scanner-view-results" to={taskResultsPath([task.id])}>{taskHasResults(task) ? 'View results' : 'Search task results'}<Icon name="arrow" size={14} /></Link></td><td className="scanner-actions-cell"><div className="scanner-row-actions"><Button variant="ghost" size="sm" disabled={busy || unknown} onClick={() => { setErrors({}); setEditing(task); setEditDraft(draftFromTask(task)); }}><Icon name="edit" size={16} />Edit</Button><Button variant="ghost" size="sm" disabled={busy || unknown} onClick={() => prepare({ kind: 'remove-task', ids: [task.id] })}><Icon name="trash" size={16} />Delete</Button></div></td></tr>)}</tbody></table>
            {!visible.length && !listError && <EmptyState icon={<Icon name="scan" size={24} />} title={hasListFilters ? 'No tasks match this filter' : tab === 'active' ? 'No active tasks' : tab === 'history' ? 'No tasks in history' : 'No scan tasks yet'} actions={hasListFilters ? <Button variant="secondary" onClick={clearListFilters}>Clear task filter</Button> : <Link to={`/scanner/new?returnTo=${encodeURIComponent(scannerReturn)}`} className="scanner-primary-link"><Icon name="plus" size={17} />New scan task</Link>} />}
          </div>}
          {!listPending && !listError && <div className="scanner-list-pagination"><Pagination page={currentPage} pageSize={rows} count={tab === 'planned' ? pagedPlans.length : pagedTasks.length} total={matchingCount} onPageChange={page => updateList({ page: String(page) })} /><p className="muted">{tab === 'planned' ? (planned.data?.length || 0).toLocaleString() : (tasks.data?.length || 0).toLocaleString()} {tab === 'planned' ? (planned.data?.length === 1 ? 'schedule' : 'schedules') : (tasks.data?.length === 1 ? 'task' : 'tasks')} loaded</p></div>}
        </TabPanel>
      </>}
    </>}
    <Dialog open={editing !== null && confirm === null} onClose={() => { if (!busy) setEditing(null); }} title={`Edit task ${editing?.id || ''}`} size="lg" footer={<><Button variant="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={busy || unknown} onClick={reviewUpdate}>Review changes</Button></>}>{editing && <><ScanFields updating draft={editDraft} onChange={next => { setEditDraft(next); setErrors({}); }} errors={errors} disabled={busy || unknown} />{errors.form && <Alert tone="error">{errors.form}</Alert>}</>}</Dialog>
    <Dialog open={confirm !== null} onClose={() => { if (!busy) setConfirm(null); }} title={confirm ? actionTitle(confirm) : 'Confirm'} size={confirm?.draft ? 'lg' : 'md'} footer={<><Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button><Button variant={confirm?.kind.startsWith('remove') || confirm?.kind === 'delete-results' ? 'danger' : 'primary'} loading={busy} disabled={unknown || !confirm} onClick={() => { if (confirm) operation.mutate(confirm); }}>{confirm ? actionLabel(confirm) : 'Confirm'}</Button></>}>{confirm?.draft ? <ScanReview draft={confirm.draft} scanCredits={user?.scan_credits} updating={confirm.kind === 'update'} /> : <>{confirm?.kind === 'delete-results' ? <p>Delete the stored private results for these tasks. The task records remain available. This action does not stop a running or scheduled scan.</p> : confirm?.kind === 'remove-plan' ? <p>Remove this scheduled task from the scanner’s planning list. Review its ID before continuing.</p> : <p>Delete this task record. Stored-result deletion is a separate action; this confirmation does not claim that its results will be erased.</p>}<pre className="scanner-confirm-ids">{confirm?.ids.join('\n')}</pre></>}{unknown ? unknownNotice : operation.error && <Alert tone="error" title="The action could not be completed">{operation.error.message} Your draft is kept.</Alert>}</Dialog>
    <Dialog open={details !== null} onClose={() => setDetails(null)} title="Task details" size="lg" footer={<Button variant="secondary" onClick={() => setDetails(null)}>Close</Button>}>
      {details && <div className="scanner-task-details">
        <div className="scanner-detail-heading"><span className="scanner-detail-symbol"><Icon name="scan" size={23} /></span><div><h3>{[...(details.host_list || []), ...(details.cidr_list || [])][0] || 'Scan task'}</h3><code>{details.id}</code></div>{'status' in details && <Badge tone={taskGroup(details.status) === 'active' ? 'accent' : 'neutral'}>{details.status || 'Status not provided'}</Badge>}</div>
        {'status' in details && details.done_task_count !== undefined && details.task_count !== undefined && <Progress task={details} showStatus={false} />}
        <section><h3 className="scanner-detail-section"><Icon name="filter" size={17} />Scope</h3><dl className="scanner-details"><div><dt>Hosts</dt><dd>{details.host_list?.length ? details.host_list.join(', ') : 'Not provided'}</dd></div><div><dt>CIDR blocks</dt><dd>{details.cidr_list?.length ? details.cidr_list.join(', ') : 'Not provided'}</dd></div><div><dt>Ports</dt><dd>{details.port_list?.join(', ') || 'Not provided'}</dd></div><div><dt>Schedule</dt><dd><ScheduleText schedule={details.schedule} /></dd></div></dl></section>
        <section><h3 className="scanner-detail-section"><Icon name="clock" size={17} />Activity</h3><dl className="scanner-details">{'created_at' in details && <div><dt>Created</dt><dd>{dateLabel(details.created_at)}</dd></div>}{'start_time' in details && <div><dt>Started</dt><dd>{details.start_time ? dateLabel(details.start_time) : 'Not reported'}</dd></div>}{'end_time' in details && <div><dt>Ended</dt><dd>{details.end_time ? dateLabel(details.end_time) : 'Not reported'}</dd></div>}{'user_name' in details && <div><dt>Owner</dt><dd>{details.user_name || 'Not provided'}</dd></div>}</dl></section>
        <details className="scanner-raw-record"><summary><Icon name="code" size={17} />Raw task data<Icon name="chevron-down" size={16} /></summary><CodeCanvas content={JSON.stringify(details, null, 2)} language="json" title="Task record" /></details>
      </div>}
    </Dialog>
    <ExportDialog open={exportIds !== null} onClose={() => setExportIds(null)} query={{ task_ids: exportIds || [], page: 1, docs_per_page: 20 }} privateSearch taskIds={exportIds || undefined} />
  </div>;
}
