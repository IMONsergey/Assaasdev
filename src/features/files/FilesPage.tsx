import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type BucketAnalytics, type BucketFile, type BucketFilter, type BucketResults, type ResponseMetadata } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Icon, PageHeader, Pagination, SelectField, Spinner, Tabs } from '../../components/ui';
import { asset } from '../../config';
import { formatTimestamp } from '../../lib/format';
import { ExportDialog } from './ExportDialog';
import { DEFAULT_FILE_DRAFT, FILE_PAGE_CAPS, bucketIdentity, draftFromFilter, fileName, fileParams, fileSize, filterChips, filterFromDraft, normalizeBucketFilter, observedFileUrl, readFileParams, type FileDraft, type FilesView } from './model';
import './files.css';

type Job = { filter: BucketFilter; view: FilesView; principal: string; sequence: number };
type Result = Job & { metadata?: ResponseMetadata; response: BucketResults | BucketAnalytics };

function checkedResult(value: unknown, view: FilesView): BucketResults | BucketAnalytics {
  if (!value || typeof value !== 'object' || !('result' in value) || !Array.isArray(value.result) || !('result_count' in value) || typeof value.result_count !== 'number' || !Number.isSafeInteger(value.result_count) || value.result_count < 0) throw new ApiError('transport', 'The server returned an unexpected bucket result. Your filters have been kept.', { outcome: 'unknown' });
  if (value.result.some(row => !row || typeof row !== 'object' || (view === 'hosts' && (typeof row.host !== 'string' || typeof row.file_count !== 'number' || row.file_count < 0)))) throw new ApiError('transport', 'Some returned bucket records are incomplete. Your filters have been kept.', { outcome: 'unknown' });
  return value as BucketResults | BucketAnalytics;
}

function FileGlyph({ extension }: { extension?: string }) {
  return <span className="files-record-glyph" aria-hidden="true"><img src={asset('figma/files/imgIconFile.svg')} width="20" height="20" alt="" />{extension && <small>{extension.slice(0, 4).toUpperCase()}</small>}</span>;
}

export function FilesPage() {
  const { api, session, user, metadata, toast, mode } = useApp(), queryClient = useQueryClient();
  const [params, setParams] = useSearchParams(), serialized = params.toString();
  const restored = useMemo(() => readFileParams(new URLSearchParams(serialized)), [serialized]);
  const [draft, setDraft] = useState<FileDraft>(() => draftFromFilter(restored.filter));
  const [view, setView] = useState<FilesView>(restored.view), [advanced, setAdvanced] = useState(false);
  const [job, setJob] = useState<Job | null>(null), [paused, setPaused] = useState(false), [formError, setFormError] = useState('');
  const [exportOpen, setExportOpen] = useState(false), [selected, setSelected] = useState<BucketFile | null>(null);
  const nextSequence = useRef(0), lastWritten = useRef(''), filterPanel = useRef<HTMLDivElement>(null);
  const [instanceId] = useState(() => crypto.randomUUID());
  const principal = user?.user_id || user?.session_id || session.status;
  const plan = user?.subscription?.type || metadata?.subscription_type || 'Free';
  const hasAccount = session.status === 'authenticated';
  const permitted = hasAccount && (metadata?.full_access === true || ['Plus', 'Expert', 'Business'].includes(plan));
  const maxPage = metadata?.full_access ? undefined : FILE_PAGE_CAPS[plan] ?? 2;
  const queryKey = ['bucket-results', principal, instanceId, job?.sequence ?? 0] as const;
  const results = useQuery<Result>({
    queryKey, enabled: !!job && job.principal === principal && permitted && !paused,
    retry: false, refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    staleTime: Infinity, gcTime: 60000,
    placeholderData: previous => previous?.principal === principal && previous.view === job?.view ? previous : undefined,
    queryFn: async ({ signal }) => {
      if (!job) throw new Error('Start a file search first.');
      const response = await api.request<BucketResults | BucketAnalytics>(job.view === 'files' ? 'buckets' : 'bucket_analytics', job.filter, { signal, mutation: false });
      return { ...job, response: checkedResult(response.data, job.view), metadata: response.metadata };
    },
  });
  useEffect(() => {
    if (lastWritten.current === serialized) return;
    setDraft(draftFromFilter(restored.filter)); setView(restored.view); setFormError('');
  }, [serialized, restored]);
  useEffect(() => { setJob(null); setPaused(false); setSelected(null); setExportOpen(false); }, [principal]);
  useEffect(() => {
    // At most six completed result snapshots; no data survives a principal change.
    const entries = queryClient.getQueryCache().findAll({ queryKey: ['bucket-results', principal], type: 'inactive' }).sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
    for (const entry of entries.slice(5)) queryClient.removeQueries({ queryKey: entry.queryKey, exact: true });
  }, [job?.sequence, results.dataUpdatedAt, principal, queryClient]);

  const shown = results.data?.principal === principal && results.data.view === view ? results.data : undefined;
  const response = shown?.response, loading = results.isFetching && job?.view === view;
  const previousResults = !!shown && shown.sequence !== job?.sequence;
  const activeFilter = shown?.filter ?? job?.filter;
  const appliedChips = activeFilter ? filterChips(activeFilter) : [];
  const changed = useMemo(() => {
    if (!activeFilter) return false;
    try { const applied = { ...activeFilter, page: 1 }; return JSON.stringify(filterFromDraft(draft)) !== JSON.stringify(normalizeBucketFilter(applied)); } catch { return true; }
  }, [draft, activeFilter]);
  const visibleError = job?.view === view && !paused ? results.error : null;
  const uncertain = visibleError instanceof ApiError && visibleError.outcome === 'unknown';

  function edit<K extends keyof FileDraft>(key: K, value: FileDraft[K]) { setDraft(current => ({ ...current, [key]: value })); setFormError(''); }
  function run(filter: BucketFilter, targetView = view, updateDraft = false) {
    try {
      const normalized = normalizeBucketFilter(filter);
      if (!permitted) { setFormError(hasAccount ? 'Files and bucket analytics require Plus access or higher. Your filters have been kept.' : 'Sign in to an account with file search access. Your filters have been kept.'); return; }
      if (maxPage && (normalized.page ?? 1) > maxPage) { setFormError(`Your current plan supports up to ${maxPage} pages.`); return; }
      setFormError(''); setPaused(false); setView(targetView);
      setJob({ filter: normalized, view: targetView, principal, sequence: ++nextSequence.current });
      if (updateDraft) setDraft(draftFromFilter(normalized));
      const next = fileParams(normalized, targetView); lastWritten.current = next.toString(); setParams(next, { replace: false });
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Check the search filters.'); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try { run(filterFromDraft(draft)); } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Check the search filters.'); }
  }
  async function stop() { setPaused(true); await queryClient.cancelQueries({ queryKey, exact: true }); }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); toast('Copied to clipboard.', 'success'); } catch { toast('Copy was blocked by the browser. Select the text and copy it manually.', 'error'); } }
  function openFilters() { setAdvanced(true); requestAnimationFrame(() => filterPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }

  return <div className="files-page stack">
    <PageHeader title="Find files in cloud storage" description="Search indexed file records and inspect their metadata." />
    <Tabs items={[{ id: 'files', label: 'Files' }, { id: 'hosts', label: 'Buckets' }]} value={view} onChange={value => { setView(value as FilesView); setSelected(null); }} />
    {restored.error && <Alert tone="error" title="These file filters could not be restored" actions={<Button variant="secondary" onClick={() => { lastWritten.current = ''; setParams({}); }}>Start a new search</Button>}>{restored.error}</Alert>}
    {!permitted && session.status !== 'loading' && <Alert tone="info" title={hasAccount ? 'File search is available on Plus and above' : 'Sign in to search files'} actions={<Link className="inline-link" to={hasAccount ? '/billing' : '/auth/login?returnTo=%2Ffiles'}>{hasAccount ? 'Compare plans' : 'Continue to sign in'} →</Link>}>Prepare your filters below. Files and bucket analytics use your account’s search access.</Alert>}

    <form className="files-filter-surface" onSubmit={submit} aria-label="File search filters">
      <div className="files-primary-grid">
        <Field label="Hostname" placeholder="Any hostname" value={draft.host} onChange={event => edit('host', event.target.value)} />
        <Field label="Keywords" placeholder="documentation, report" value={draft.keywords} onChange={event => edit('keywords', event.target.value)} />
        <Field label="Stopwords" placeholder="backup, tmp" value={draft.stopWords} onChange={event => edit('stopWords', event.target.value)} />
        <Field label="Extensions" placeholder="pdf, txt" value={draft.extensions} onChange={event => edit('extensions', event.target.value)} />
        <Field label="Size from · MB" type="number" min="0" step="any" placeholder="Any size" value={draft.minSize} onChange={event => edit('minSize', event.target.value)} />
        <Field label="Size to · MB" type="number" min="0" step="any" placeholder="No upper limit" value={draft.maxSize} onChange={event => edit('maxSize', event.target.value)} />
      </div>
      <div className="files-filter-actions">
        <Button type="submit" loading={loading} disabled={!permitted}>{view === 'files' ? 'Search files' : 'Search buckets'}<img src={asset('figma/files/imgIconSearch1.svg')} width="20" height="20" alt="" /></Button>
        <Button variant="secondary" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} aria-controls="files-more-filters">{advanced ? 'Fewer filters' : 'More filters'}<img src={asset('figma/files/imgIconFilter.svg')} width="20" height="20" alt="" /></Button>
        {draft.products && <Badge>Products · {draft.products.split(',').filter(part => part.trim()).length}</Badge>}
        {draft.alphabets && <Badge>Alphabets · {draft.alphabets}</Badge>}
        <span className="files-request-cost">1 search credit per request</span>
      </div>
      {advanced && <div id="files-more-filters" ref={filterPanel} className="files-advanced-panel">
        <div className="files-advanced-heading"><div><h2>Refine your search</h2><p>List values are separated by commas. Filters apply when you run a search.</p></div><Button variant="ghost" size="sm" onClick={() => { setDraft({ ...DEFAULT_FILE_DRAFT }); setFormError(''); }}>Clear filters</Button></div>
        <div className="files-primary-grid">
          <SelectField label="Extension matching" value={draft.excludeExtensions ? 'exclude' : 'include'} onChange={event => edit('excludeExtensions', event.target.value === 'exclude')}><option value="include">Include these extensions</option><option value="exclude">Exclude these extensions</option></SelectField>
          <Field label="Storage products" placeholder="azureblobstorage" hint="Product identifiers returned by the service." value={draft.products} onChange={event => edit('products', event.target.value)} />
          <Field label="Alphabets" placeholder="latin" hint="For example, latin. Separate values with commas." value={draft.alphabets} onChange={event => edit('alphabets', event.target.value)} />
        </div>
        <div className="files-date-grid">
          <fieldset><legend>Discovered · UTC</legend><Field label="From, inclusive" type="datetime-local" step="1" value={draft.discoveredFrom} onChange={event => edit('discoveredFrom', event.target.value)} /><Field label="To, inclusive" type="datetime-local" step="1" value={draft.discoveredTo} onChange={event => edit('discoveredTo', event.target.value)} /></fieldset>
          <fieldset><legend>Last updated · UTC</legend><Field label="From, inclusive" type="datetime-local" step="1" value={draft.updatedFrom} onChange={event => edit('updatedFrom', event.target.value)} /><Field label="To, inclusive" type="datetime-local" step="1" value={draft.updatedTo} onChange={event => edit('updatedTo', event.target.value)} /></fieldset>
        </div>
        <div className="files-sorting-grid"><SelectField label="Sort order" value={draft.sort} onChange={event => edit('sort', event.target.value)}><option value="uts:desc">Most recently updated</option><option value="uts:asc">Least recently updated</option><option value="cts:desc">Most recently discovered</option><option value="cts:asc">Earliest discovered</option><option value="size_mb:desc">Largest first</option><option value="size_mb:asc">Smallest first</option></SelectField><SelectField label="Rows per page" value={draft.pageSize} onChange={event => edit('pageSize', event.target.value)}>{[10, 20, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}{![10, 20, 25, 50].includes(Number(draft.pageSize)) && <option value={draft.pageSize}>{draft.pageSize}</option>}</SelectField></div>
      </div>}
      {formError && <Alert tone="error" title="Check your filters">{formError}</Alert>}
    </form>

    {changed && <p className="files-draft-notice">Filters have changed. Run a search to update these results.</p>}
    {!job && restored.restored && <p className="files-draft-notice">Filters restored from this link. Run a search when you’re ready.</p>}
    {loading && <div className="files-loading-bar"><Spinner label={shown ? 'Updating results. The previous response remains visible.' : 'Looking for matching records…'} /><Button variant="secondary" size="sm" onClick={() => void stop()}>Stop waiting</Button></div>}
    {paused && job?.view === view && <Alert tone="warning" title="Search stopped">No new result is confirmed. Your filters are preserved; the server may have already processed this request. <Button variant="secondary" size="sm" onClick={() => job && run(job.filter, job.view)}>Run again</Button></Alert>}
    {visibleError && <Alert tone={uncertain ? 'warning' : 'error'} title={uncertain ? 'The response was interrupted' : 'Search could not be completed'} actions={<Button variant="secondary" size="sm" onClick={() => job && run(job.filter, job.view)}>Run again</Button>}>{visibleError.message} Your filters have been kept.{uncertain && ' A search credit may already have been used. Starting again sends a new request.'}</Alert>}

    {shown && response && <section className="files-result-section" aria-label={view === 'files' ? 'File results' : 'Bucket results'}>
      <div className="files-result-heading"><div><h2>{response.result_count.toLocaleString()} {view === 'files' ? 'file records' : 'bucket records'}</h2><p>{response.result.length.toLocaleString()} loaded · Page {shown.filter.page ?? 1}{previousResults ? ' · Previous response' : ''}</p></div><Button variant="secondary" size="sm" disabled={loading || !response.result.length || previousResults} onClick={() => setExportOpen(true)}>Download records<Icon name="download" size={20} /></Button></div>
      {appliedChips.length > 0 && <div className="files-applied-chips" aria-label="Applied filters"><span>Applied</span>{appliedChips.map(chip => <span key={chip}>{chip}</span>)}</div>}
      {response.result.length > 0 ? view === 'files' ? <div className="files-table-wrap"><table className="files-table"><caption className="files-sr-only">Indexed file records returned by the server</caption><thead><tr><th>File / bucket</th><th>Size</th><th>Type</th><th>Last updated</th></tr></thead><tbody>{(response as BucketResults).result.map((file, index) => <tr key={`${file.host}/${file.container}/${file.key}/${index}`}><td><div className="files-name-row"><FileGlyph extension={file.extension} /><button type="button" className="files-record-name" onClick={() => setSelected(file)}>{fileName(file)}</button></div><div className="files-record-path">{bucketIdentity(file.host, file.container) || 'Bucket not provided'}{file.key?.includes('/') ? <span> / {file.key.slice(0, file.key.lastIndexOf('/'))}</span> : null}</div></td><td data-label="Size">{fileSize(file.size_mb)}</td><td data-label="Type"><span className="files-extension">{file.extension?.toUpperCase() || 'Not observed'}</span></td><td data-label="Last updated"><time dateTime={file.uts ? new Date(file.uts * 1000).toISOString() : undefined}>{formatTimestamp(file.uts)}</time></td></tr>)}</tbody></table></div> : <div className="files-table-wrap"><table className="files-table files-table--buckets"><caption className="files-sr-only">Bucket groups and observed file counts</caption><thead><tr><th>Bucket / container</th><th>Matching files</th><th>Explore</th></tr></thead><tbody>{(response as BucketAnalytics).result.map((bucket, index) => <tr key={`${bucket.host}/${bucket.container}/${index}`}><td><div className="files-bucket-name"><Icon name="database" size={19} /><strong>{bucket.host}</strong></div>{bucket.container && <span className="files-record-path">{bucket.container}</span>}</td><td data-label="Matching files">{bucket.file_count.toLocaleString()}</td><td><Button variant="secondary" size="sm" disabled={loading} onClick={() => run({ ...shown.filter, host: bucketIdentity(bucket.host, bucket.container), page: 1 }, 'files', true)}>Search this bucket<Icon name="arrow" size={15} /></Button></td></tr>)}</tbody></table></div> : <EmptyState title={view === 'files' ? 'No files match this search' : 'No buckets match this search'} description="Try a broader keyword, remove stopwords or adjust the file filters." actions={<Button variant="secondary" onClick={openFilters}>Edit filters</Button>} />}
      <div className={loading ? 'files-pagination-disabled' : ''} inert={loading || undefined}><Pagination page={shown.filter.page ?? 1} pageSize={shown.filter.docs_per_page ?? 20} count={response.result.length} total={response.result_count} maxPage={maxPage} onPageChange={page => run({ ...shown.filter, page }, view)} /></div>
      <p className="files-result-note">Counts are the server’s reported {view === 'files' ? 'file records' : 'bucket groups'}. {view === 'hosts' ? 'Each group has its own matching file count. ' : ''}Stored size uses MB; an absent size is shown separately from zero.</p>
    </section>}

    {!shown && !loading && !visibleError && !paused && <div className="files-start-state"><EmptyState icon={<Icon name="database" size={19} />} title={view === 'files' ? 'Find the files that matter' : 'Explore matching buckets'} description={view === 'files' ? 'Search by hostname, filename, extension or observed metadata. The search starts when you choose Search files.' : 'Group matching file records by bucket and container. Loading this view uses one search credit.'} actions={view === 'hosts' ? <Button disabled={!permitted} onClick={() => { try { run(filterFromDraft(draft), 'hosts'); } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Check your filters.'); } }}>Load buckets</Button> : mode === 'demo' ? <Button variant="secondary" disabled={!permitted} onClick={() => run(filterFromDraft(DEFAULT_FILE_DRAFT), 'files', true)}>Explore sample files</Button> : undefined} /></div>}

    <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected ? fileName(selected) : 'File details'} size="lg" footer={<Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>}>
      {selected && <div className="stack"><div className="files-detail-title"><FileGlyph extension={selected.extension} /><Badge>{selected.extension?.toUpperCase() || 'File'}</Badge><span>{fileSize(selected.size_mb)}</span></div><dl className="files-detail-facts"><div><dt>Bucket</dt><dd>{selected.host ?? 'Not observed'}</dd></div>{selected.container !== undefined && <div><dt>Container</dt><dd>{selected.container || 'Empty value'}</dd></div>}<div><dt>Object key</dt><dd className="mono">{selected.key ?? 'Not observed'}</dd></div><div><dt>Protocol</dt><dd>{selected.protocol ?? 'Not observed'}</dd></div><div><dt>Discovered</dt><dd>{formatTimestamp(selected.cts)}</dd></div><div><dt>Last updated</dt><dd>{formatTimestamp(selected.uts)}</dd></div><div><dt>Alphabets</dt><dd>{selected.alphabets?.join(', ') || 'Not observed'}</dd></div>{selected.alias_hosts && <div><dt>Alias hosts</dt><dd>{selected.alias_hosts.length ? selected.alias_hosts.join(', ') : 'None returned'}</dd></div>}</dl><div className="cluster"><Button variant="secondary" onClick={() => void copy(JSON.stringify(selected, null, 2))}><Icon name="copy" size={20} />Copy metadata</Button>{observedFileUrl(selected) && <a className="button button--secondary" href={observedFileUrl(selected)!} target="_blank" rel="noopener noreferrer">Open observed URL<Icon name="external" size={20} /></a>}</div><p className="muted">This record describes an indexed observation. Opening its URL contacts that storage host; current availability may differ.</p>{mode === 'demo' && <Alert tone="info">This is a sample record on an example domain. No external file was fetched to display it.</Alert>}</div>}
    </Dialog>
    <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} bucketFilter={shown?.filter ?? job?.filter ?? {}} />
  </div>;
}
