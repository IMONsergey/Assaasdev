import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, isApiError, type PlanningTask, type PrivateTask, type PrivateTaskRequest } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Checkbox, Dialog, EmptyState, Field, Icon, PageHeader, Spinner, Tabs } from '../../components/ui';
import { ExportDialog } from '../files/ExportDialog';
import { dateLabel, encodeSearch } from '../search/model';
import { buildScanRequest, draftFromTask, EMPTY_SCAN_DRAFT, sameScope, taskGroup, taskHasResults, taskProgress, taskResultsLabel, type ScanDraft, type ScanErrors } from './model';
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

function Progress({ task }: { task: PrivateTask }) {
  const progress = taskProgress(task), group = taskGroup(task.status);
  const failed = ['failed', 'error'].includes((task.status || '').toLowerCase());
  const cancelled = ['cancelled', 'canceled'].includes((task.status || '').toLowerCase());
  return <div className={`scanner-progress scanner-progress-${group}${failed ? ' scanner-progress--error' : cancelled ? ' scanner-progress--cancelled' : ''}`}><span>{task.status || 'Status not provided'}{task.done_task_count !== undefined && task.task_count !== undefined ? ` · ${task.done_task_count.toLocaleString()} / ${task.task_count.toLocaleString()}` : ''}</span>{progress !== undefined && <progress value={progress} max="100" aria-label={`${task.id} completed checks`}>{progress}%</progress>}</div>;
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
  const [selected, setSelected] = useState<string[]>([]), [filter, setFilter] = useState('');
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
    if (result.action.kind === 'create') { setDraft({ ...EMPTY_SCAN_DRAFT }); navigate(`/scanner?created=${encodeURIComponent(result.taskId!)}`); }
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
      if (confirmed) { operation.reset(); setConfirm(null); setEditing(null); setReconcileMessage('The current task list confirms the requested state.'); toast('Current state verified from the task list.', 'success'); if (createdId) navigate(`/scanner?created=${encodeURIComponent(createdId)}`); }
      else setReconcileMessage('The current lists do not confirm the requested change. Review the tasks before deciding whether to submit another request.');
    } finally { setChecking(false); }
  }
  function reviewAgain() { operation.reset(); setConfirm(null); setRetryNotice('The previous outcome was not confirmed. Review the refreshed task list and the scope before making another request.'); }
  const tab = ['all', 'active', 'history', 'planned'].includes(params.get('tab') || '') ? params.get('tab')! : 'all';
  const changeTab = (value: string) => { const next = new URLSearchParams(params); next.set('tab', value); setParams(next, { replace: true }); };
  const active = tasks.data?.filter(task => taskGroup(task.status) === 'active') || [], history = tasks.data?.filter(task => taskGroup(task.status) === 'history') || [];
  const visible = useMemo(() => (tasks.data || []).filter(task => (tab === 'active' ? taskGroup(task.status) === 'active' : tab === 'history' ? taskGroup(task.status) === 'history' : true) && (!filter || JSON.stringify([task.id, task.host_list, task.cidr_list, task.port_list]).toLowerCase().includes(filter.toLowerCase()))), [tasks.data, tab, filter]);
  const visiblePlanned = useMemo(() => (planned.data || []).filter(task => !filter || JSON.stringify([task.id, task.host_list, task.cidr_list, task.port_list]).toLowerCase().includes(filter.toLowerCase())), [planned.data, filter]);
  const selectedCurrent = selected.filter(id => tasks.data?.some(task => task.id === id));
  const selectedQuery = { task_ids: selectedCurrent, page: 1, docs_per_page: 20 };
  const fullAllowance = user?.subscription?.scan_credits;
  const knownCreditRatio = user?.scan_credits !== undefined && fullAllowance !== undefined && fullAllowance > 0 ? Math.max(0, Math.min(100, user.scan_credits / fullAllowance * 100)) : undefined;
  const listError = tab === 'planned' ? planned.error : tasks.error;
  const listPending = tab === 'planned' ? planned.isPending : tasks.isPending;
  const toggle = (id: string) => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  const unknownNotice = <Alert tone="warning" title="The previous action is not confirmed" actions={<div className="cluster"><Button variant="secondary" loading={checking} onClick={() => void reconcile()}>Check task list</Button>{reconcileChecked && <Button variant="ghost" disabled={checking} onClick={reviewAgain}>Return to review</Button>}</div>}>{operation.error?.message} This action will not be repeated automatically.{reconcileMessage && <p>{reconcileMessage}</p>}</Alert>;

  return <div className="scanner-page"><PageHeader title={creating ? 'New scan task' : 'Private Scanner'} description={creating ? 'Set the targets and ports. Review before submitting.' : 'Your tasks, their progress and private results.'} actions={creating ? <Link className="scanner-secondary-link" to="/scanner">Back to tasks</Link> : <Link className="scanner-primary-link" to="/scanner/new">New task<Icon name="plus" size={18} /></Link>} />{session.status === 'loading' ? <Spinner label="Checking your session" /> : !canRead ? <Alert tone="info" title="Sign in to use Private Scanner"><Link to={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Continue to sign in</Link>. Private scanning requires Business or full access.</Alert> : <>{!canUse && !tasks.isPending && !planned.isPending && <Alert tone="info" title="Private scanning requires Business or full access" actions={<Link className="scanner-secondary-link" to="/billing">View plans</Link>}>Your account could not load scan tasks. The server controls access to private scanning.</Alert>}{unknown && unknownNotice}{retryNotice && <Alert tone="warning">{retryNotice}</Alert>}{!unknown && operation.error && !confirm && <Alert tone="error">{operation.error.message}</Alert>}{reconcileMessage && !unknown && <Alert tone="info">{reconcileMessage}</Alert>}{creating ? <form onSubmit={event => { event.preventDefault(); reviewCreate(); }}><div className="scanner-create-layout"><ScanFields draft={draft} onChange={next => { setDraft(next); setErrors({}); }} errors={errors} disabled={busy || unknown} /><ScanEstimate draft={draft} scanCredits={user?.scan_credits} /></div>{errors.form && <Alert tone="error" title="Check the scan targets">{errors.form}</Alert>}<div className="scanner-form-actions"><Button type="submit" disabled={!canUse || busy || unknown}>Review task<Icon name="arrow" size={18} /></Button><Link to="/scanner" className="inline-link">Cancel</Link></div></form> : <>{params.get('created') && <Alert tone="success" title="Task accepted">Task {params.get('created')} was accepted by the scanner. Its current status appears in the list when the server returns it.</Alert>}<section className="scanner-overview"><div><strong>{tasks.data ? `${tasks.data.length.toLocaleString()} tasks` : 'Tasks'}</strong><span>{tasks.data ? `${active.length} active · ${history.length} in history${tasks.data.length - active.length - history.length > 0 ? ` · ${tasks.data.length - active.length - history.length} other states` : ''}` : 'Waiting for the task list'}</span></div><div><h2>Scan credits</h2>{knownCreditRatio !== undefined && <progress value={knownCreditRatio} max="100" aria-label="Scan credits relative to the included allocation" />}<span>{user?.scan_credits !== undefined ? `${user.scan_credits.toLocaleString()} available` : 'Balance not provided'}</span></div><div><h2>Private by default</h2><span>Results stay linked to the task that produced them.</span></div></section><div className="scanner-list-heading"><Tabs items={[{ id: 'all', label: 'Tasks', count: tasks.data?.length }, { id: 'active', label: 'Active', count: active.length }, { id: 'history', label: 'History', count: history.length }, { id: 'planned', label: 'Scheduled', count: planned.data?.length }]} value={tab} onChange={changeTab} /><Button variant="ghost" size="sm" disabled={tasks.isFetching || planned.isFetching} onClick={() => void refreshLists() }><Icon name="refresh" size={16} />Refresh</Button></div><div className="scanner-list-controls"><Field label="Find a task" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Task ID, target or port" /><Checkbox label="Refresh every 15 seconds" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} /></div>{selectedCurrent.length > 0 && tab !== 'planned' && <div className="scanner-selection-bar"><strong>{selectedCurrent.length} selected</strong><Link to={`/private/search?${encodeSearch(selectedQuery)}`}>View results</Link><Button variant="secondary" size="sm" disabled={busy || unknown} onClick={() => setExportIds(selectedCurrent)}>Export results</Button><Button variant="danger" size="sm" disabled={busy || unknown} onClick={() => prepare({ kind: 'delete-results', ids: [...selectedCurrent] })}>Delete stored results</Button><Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear selection</Button></div>}{listPending && <Spinner label={tab === 'planned' ? 'Loading scheduled tasks' : 'Loading scan tasks'} />}{listError && <Alert tone="error" title="The task list could not be loaded" actions={<Button variant="secondary" onClick={() => void refreshLists()}>Try again</Button>}>{listError.message}</Alert>}{!listPending && tab === 'planned' && <div className="scanner-tasks-table-wrap"><table className="scanner-task-table scanner-task-table--planned"><thead><tr><th>Targets</th><th>Schedule</th><th>Owner</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visiblePlanned.map(task => <tr key={task.id}><td><button type="button" className="scanner-target-button" onClick={() => setDetails(task)}><ScopeText task={task} /></button></td><td data-label="Schedule"><code>{task.schedule || 'Not provided'}</code></td><td data-label="Owner">{task.user_name || 'Not provided'}</td><td className="scanner-actions-cell"><div className="scanner-row-actions"><Button variant="secondary" size="sm" disabled={busy || unknown} onClick={() => { setErrors({}); setEditing(task); setEditDraft(draftFromTask(task)); }}>Edit</Button><Button variant="secondary" size="sm" disabled={busy || unknown} onClick={() => prepare({ kind: 'remove-plan', ids: [task.id] })}>Remove<Icon name="trash" size={16} /></Button></div></td></tr>)}</tbody></table>{!visiblePlanned.length && !listError && <EmptyState title={filter ? 'No scheduled tasks match' : 'No scheduled tasks'} description={filter ? 'Change the task filter.' : 'Create a task with a custom Cron schedule to see it here.'} actions={filter ? <Button variant="secondary" onClick={() => setFilter('')}>Clear task filter</Button> : <Link to="/scanner/new" className="scanner-primary-link">New scan task</Link>} />}</div>}{!listPending && tab !== 'planned' && <div className="scanner-tasks-table-wrap"><table className="scanner-task-table"><thead><tr><th className="scanner-check-column"><span className="sr-only">Select</span></th><th>Targets</th><th>Created</th><th>Status / checks</th><th>Results</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map(task => <tr key={task.id} className={params.get('created') === task.id ? 'scanner-recent-task' : ''}><td className="scanner-select-cell"><input type="checkbox" aria-label={`Select task ${task.id}`} checked={selectedCurrent.includes(task.id)} disabled={busy || unknown} onChange={() => toggle(task.id)} /></td><td><button type="button" className="scanner-target-button" onClick={() => setDetails(task)}><ScopeText task={task} /></button><p className="scanner-task-time"><span>Schedule</span> {task.schedule || 'Not provided'}</p><p className="scanner-task-time"><span>Started</span> {task.start_time ? dateLabel(task.start_time) : 'Not reported'}<span>Ended</span> {task.end_time ? dateLabel(task.end_time) : 'Not reported'}</p></td><td data-label="Created"><span className="scanner-created-time">{dateLabel(task.created_at)}</span></td><td data-label="Status / checks"><Progress task={task} /></td><td data-label="Results"><span className="scanner-result-count">{taskResultsLabel(task)}</span><Link className="scanner-view-results" to={`/private/search?${encodeSearch({ task_ids: [task.id], page: 1, docs_per_page: 20 })}`}>{taskHasResults(task) ? 'View results' : 'Search task results'}</Link></td><td className="scanner-actions-cell"><div className="scanner-row-actions"><Button variant="secondary" size="sm" disabled={busy || unknown} onClick={() => { setErrors({}); setEditing(task); setEditDraft(draftFromTask(task)); }}>Edit</Button><Button variant="secondary" size="sm" disabled={busy || unknown} onClick={() => prepare({ kind: 'remove-task', ids: [task.id] })}>Delete<Icon name="trash" size={16} /></Button></div></td></tr>)}</tbody></table>{!visible.length && !listError && <EmptyState title={filter ? 'No tasks match this filter' : tab === 'active' ? 'No active tasks' : tab === 'history' ? 'No tasks in history' : 'No scan tasks yet'} description={filter ? 'Try a task ID, address or different port.' : 'Add hosts or a network, choose ports, then review the task before submitting.'} actions={filter ? <Button variant="secondary" onClick={() => setFilter('')}>Clear task filter</Button> : <Link to="/scanner/new" className="scanner-primary-link">New scan task</Link>} />}</div>}<p className="scanner-list-note"><Icon name="scan" size={18} />Add hosts or a network, choose ports, then review the task before submitting.</p></>}</>}
    <Dialog open={editing !== null && confirm === null} onClose={() => { if (!busy) setEditing(null); }} title={`Edit task ${editing?.id || ''}`} size="lg" footer={<><Button variant="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={busy || unknown} onClick={reviewUpdate}>Review changes</Button></>}><ScanFields updating draft={editDraft} onChange={next => { setEditDraft(next); setErrors({}); }} errors={errors} disabled={busy || unknown} />{errors.form && <Alert tone="error">{errors.form}</Alert>}<p className="scanner-edit-note">The scanner applies supported task changes. The response and refreshed task list determine their outcome.</p></Dialog>
    <Dialog open={confirm !== null} onClose={() => { if (!busy) setConfirm(null); }} title={confirm ? actionTitle(confirm) : 'Confirm'} size={confirm?.draft ? 'lg' : 'md'} footer={<><Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button><Button variant={confirm?.kind.startsWith('remove') || confirm?.kind === 'delete-results' ? 'danger' : 'primary'} loading={busy} disabled={unknown || !confirm} onClick={() => { if (confirm) operation.mutate(confirm); }}>{confirm ? actionLabel(confirm) : 'Confirm'}</Button></>}>{confirm?.draft ? <ScanReview draft={confirm.draft} scanCredits={user?.scan_credits} updating={confirm.kind === 'update'} /> : <>{confirm?.kind === 'delete-results' ? <p>Delete the stored private results for these tasks. The task records remain available. This action does not stop a running or scheduled scan.</p> : confirm?.kind === 'remove-plan' ? <p>Remove this scheduled task from the scanner’s planning list. Review its ID before continuing.</p> : <p>Delete this task record. Stored-result deletion is a separate action; this confirmation does not claim that its results will be erased.</p>}<pre className="scanner-confirm-ids">{confirm?.ids.join('\n')}</pre></>}{unknown ? unknownNotice : operation.error && <Alert tone="error" title="The action could not be completed">{operation.error.message} Your draft is kept.</Alert>}</Dialog>
    <Dialog open={details !== null} onClose={() => setDetails(null)} title={`Task ${details?.id || ''}`} size="lg">{details && <><dl className="scanner-details">{'status' in details && <div><dt>Status / checks</dt><dd><Progress task={details} /></dd></div>}{'created_at' in details && <div><dt>Created</dt><dd>{dateLabel(details.created_at)}</dd></div>}{'start_time' in details && <div><dt>Started</dt><dd>{details.start_time ? dateLabel(details.start_time) : 'Not reported'}</dd></div>}{'end_time' in details && <div><dt>Ended</dt><dd>{details.end_time ? dateLabel(details.end_time) : 'Not reported'}</dd></div>}<div><dt>Hosts</dt><dd>{details.host_list?.join(', ') || 'Not provided'}</dd></div><div><dt>CIDR blocks</dt><dd>{details.cidr_list?.join(', ') || 'Not provided'}</dd></div><div><dt>Ports</dt><dd>{details.port_list?.join(', ') || 'Not provided'}</dd></div><div><dt>Schedule</dt><dd><code>{details.schedule || 'Not provided'}</code></dd></div></dl><details><summary>Complete received task record</summary><pre className="scanner-json">{JSON.stringify(details, null, 2)}</pre></details></>}</Dialog>
    <ExportDialog open={exportIds !== null} onClose={() => setExportIds(null)} query={{ task_ids: exportIds || [], page: 1, docs_per_page: 20 }} privateSearch taskIds={exportIds || undefined} />
  </div>;
}
