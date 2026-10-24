import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type BucketAnalytics, type BucketFile, type BucketFilter, type BucketResults, type ResponseMetadata } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Dialog, EmptyState, Field, FilterButton, Icon, PageHeader, Pagination, SelectField, Skeleton, Spinner, TabPanel, Tabs } from '../../components/ui';
import { CodeCanvas } from '../../components/CodeCanvas';
import { asset } from '../../config';
import { formatTimestamp } from '../../lib/format';
import { ExportDialog } from './ExportDialog';
import { DEFAULT_FILE_DRAFT, FILE_PAGE_CAPS, bucketIdentity, checkedBucketResult, draftFromFilter, fileName, fileParams, fileSignInHref, fileSize, filterChips, filterFromDraft, middleTruncate, nameParts, normalizeBucketFilter, observedFileUrl, readFileParams, type FileDraft, type FilesView } from './model';
import './files.css';

type Job = { filter: BucketFilter; view: FilesView; principal: string; sequence: number };
type Result = Job & { metadata?: ResponseMetadata; response: BucketResults | BucketAnalytics };

function FileGlyph({ extension }: { extension?: string }) {
  return <span className="files-record-glyph" aria-hidden="true"><span className="files-file-icon" style={{ maskImage: `url(${asset('figma/files/imgIconFile.svg')})`, WebkitMaskImage: `url(${asset('figma/files/imgIconFile.svg')})` }} />{extension && <small>{extension.slice(0, 4).toUpperCase()}</small>}</span>;
}

function FileLabel({ value, className = '' }: { value: string; className?: string }) {
  const parts = nameParts(value);
  return <span className={`files-middle-label ${className}`} title={value}><span className="files-middle-label-start">{parts.start}</span>{parts.end && <span className="files-middle-label-end"><span>{parts.end}</span></span>}</span>;
}

const fileExamples: Array<{ title: string; description: string; icon: string; filter: BucketFilter }> = [
  { title: 'Reports & documents', description: 'Find reports across indexed storage.', icon: 'file', filter: { key_words: ['reports'] } },
  { title: 'Images & assets', description: 'Explore image files and asset paths.', icon: 'folder', filter: { key_words: ['assets'] } },
  { title: 'Large archives', description: 'Inspect archives larger than 100 MB.', icon: 'package', filter: { key_words: ['archive'], min_size_mb: 100 } },
];
const bucketExamples: typeof fileExamples = [
  { title: 'Reports by bucket', description: 'Group matching reports by storage location.', icon: 'database', filter: { key_words: ['reports'] } },
  { title: 'Asset libraries', description: 'Find buckets containing image assets.', icon: 'folder', filter: { key_words: ['assets'] } },
  { title: 'Browse all buckets', description: 'See indexed locations and their file counts.', icon: 'list', filter: {} },
];

export function FilesPage() {
  const { api, session, user, metadata, toast } = useApp(), queryClient = useQueryClient();
  const [params, setParams] = useSearchParams(), serialized = params.toString();
  const restored = useMemo(() => readFileParams(new URLSearchParams(serialized)), [serialized]);
  const [draft, setDraft] = useState<FileDraft>(() => draftFromFilter(restored.filter));
  const [view, setView] = useState<FilesView>(restored.view), [advanced, setAdvanced] = useState(false);
  const [job, setJob] = useState<Job | null>(null), [paused, setPaused] = useState(false), [formError, setFormError] = useState('');
  const [exportOpen, setExportOpen] = useState(false), [selected, setSelected] = useState<BucketFile | null>(null);
  const nextSequence = useRef(0), lastWritten = useRef('');
  const beforeFilters = useRef<FileDraft>(draft);
  const filterError = useRef<HTMLDivElement>(null);
  const filterForm = useRef<HTMLFormElement>(null);
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
      return { ...job, response: checkedBucketResult(response.data, job.view), metadata: response.metadata };
    },
  });
  useEffect(() => {
    if (lastWritten.current === serialized) { lastWritten.current = ''; return; }
    setDraft(draftFromFilter(restored.filter)); setView(restored.view); setFormError('');
    setSelected(null); setExportOpen(false); setPaused(false); setAdvanced(false);
    // Back/forward restores a completed response without silently billing another search.
    setJob(completedSnapshot(restored.filter, restored.view) ?? null);
  }, [serialized, restored, principal, instanceId, queryClient]);
  function completedSnapshot(filter: BucketFilter, targetView: FilesView) {
    const canonical = fileParams(filter, targetView).toString();
    return queryClient.getQueryCache().findAll({ queryKey: ['bucket-results', principal, instanceId] })
      .filter(entry => entry.state.status === 'success')
      .map(entry => entry.state.data as Result | undefined)
      .sort((a, b) => (b?.sequence ?? 0) - (a?.sequence ?? 0))
      .find(entry => entry && entry.view === targetView && fileParams(entry.filter, entry.view).toString() === canonical);
  }
  useEffect(() => { setJob(null); setPaused(false); setSelected(null); setExportOpen(false); }, [principal]);
  useEffect(() => {
    if (!advanced) return;
    const frame = requestAnimationFrame(() => {
      const input = filterForm.current?.querySelector<HTMLInputElement>('input');
      input?.focus({ preventScroll: true });
      input?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [advanced]);
  useEffect(() => {
    // At most six completed result snapshots; no data survives a principal change.
    const entries = queryClient.getQueryCache().findAll({ queryKey: ['bucket-results', principal], type: 'inactive' }).sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
    for (const entry of entries.slice(5)) queryClient.removeQueries({ queryKey: entry.queryKey, exact: true });
  }, [job?.sequence, results.dataUpdatedAt, principal, queryClient]);

  // A tab can display its completed snapshot while the other tab keeps loading.
  // Do not replace the active job: that would cancel a request already sent.
  const shown = results.data?.principal === principal && results.data.view === view ? results.data : completedSnapshot(restored.filter, view);
  const response = shown?.response, loading = results.isFetching && job?.view === view;
  const previousResults = !!shown && job?.view === view && shown.sequence !== job?.sequence;
  const pausedView = paused && job?.view === view;
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
      if (!permitted) { setFormError(hasAccount ? 'Files and bucket analytics require Plus access or higher. Your filters have been kept.' : 'Sign in to an account with file search access. Your filters have been kept.'); return false; }
      if (maxPage && (normalized.page ?? 1) > maxPage) { setFormError(`Your current plan supports up to ${maxPage} pages.`); return false; }
      setFormError(''); setPaused(false); setView(targetView);
      setJob({ filter: normalized, view: targetView, principal, sequence: ++nextSequence.current });
      if (updateDraft) setDraft(draftFromFilter(normalized));
      const next = fileParams(normalized, targetView); lastWritten.current = next.toString(); setParams(next, { replace: false });
      return true;
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Check the search filters.'); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try { if (run(filterFromDraft(draft))) { setAdvanced(false); return; } } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Check the search filters.'); }
    requestAnimationFrame(() => {
      filterError.current?.focus({ preventScroll: true });
      filterError.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
  }
  async function stop() { setPaused(true); await queryClient.cancelQueries({ queryKey, exact: true }); }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); toast('Copied to clipboard.', 'success'); return true; } catch { toast('Copy was blocked by the browser. Select the text and copy it manually.', 'error'); return false; } }
  function openFilters() { beforeFilters.current = { ...draft }; setAdvanced(true); setFormError(''); }
  function cancelFilters() { setDraft(beforeFilters.current); setFormError(''); setAdvanced(false); }
  function runCurrent() { try { run(filterFromDraft(draft)); } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Check your filters.'); } }

  return <div className="files-page stack">
    <PageHeader title="Buckets & files" />
    <Tabs idPrefix="files" ariaLabel="File search views" items={[{ id: 'files', label: 'Files', icon: 'list' }, { id: 'hosts', label: 'Buckets', icon: 'database' }]} value={view} onChange={value => { setView(value as FilesView); setSelected(null); const next = new URLSearchParams(window.location.search); next.set('view', value); lastWritten.current = next.toString(); setParams(next); }} />
    <TabPanel idPrefix="files" value={view === 'files' ? 'hosts' : 'files'} hidden>{null}</TabPanel>
    <TabPanel idPrefix="files" value={view} className="files-workspace stack">
    {restored.error && <Alert tone="error" title="These file filters could not be restored" actions={<Button variant="secondary" onClick={() => { lastWritten.current = ''; setParams({}); }}>Start a new search</Button>}>{restored.error}</Alert>}
    {!permitted && session.status !== 'loading' && <Alert tone="info" title={hasAccount ? 'File search is available on Plus and above' : 'Sign in to search files'} actions={<Link className="inline-link" to={hasAccount ? '/billing' : fileSignInHref(draft, view, restored.filter)}>{hasAccount ? 'Compare plans' : 'Continue to sign in'} →</Link>}>Prepare your filters below. Files and bucket analytics use your account’s search access.</Alert>}

    <form className="files-search-toolbar" onSubmit={event => { event.preventDefault(); runCurrent(); }}>
      <Field id="files-main-query" className="files-command-field" label={view === 'files' ? 'Filename or keywords' : 'Keywords in bucket files'} icon={<Icon name="search" size={18} />} placeholder={view === 'files' ? 'Search filenames or keywords' : 'Search matching files in buckets'} value={draft.keywords} onChange={event => edit('keywords', event.target.value)} autoComplete="off" />
      <FilterButton id="files-filter-toggle" aria-label="Filters" active={filterChips(restored.filter).length > 0} count={filterChips(restored.filter).length} onClick={openFilters} aria-haspopup="dialog" aria-expanded={advanced} />
      <Button type="submit" loading={loading} disabled={!permitted}>{view === 'files' ? 'Search files' : 'Search buckets'}<Icon name="arrow" size={17} /></Button>
      <div className="files-command-meta">{draft.host && <span className="files-query-summary"><Icon name="database" size={14} />{draft.host}</span>}<span className="files-request-cost">1 search credit per request</span></div>
    </form>
    {formError && !advanced && <Alert tone="error" title="Check your filters" actions={<Button variant="secondary" onClick={openFilters}>Edit filters</Button>}>{formError}</Alert>}
    <Dialog open={advanced} onClose={cancelFilters} title="File filters" placement="left" scope="workspace" className="files-filter-drawer" footer={<><Button variant="secondary" onClick={cancelFilters}>Cancel</Button>{!hasAccount && session.status !== 'loading' ? <Link className="button" to={fileSignInHref(draft, view, restored.filter)} onClick={event => { try { filterFromDraft(draft); } catch (cause) { event.preventDefault(); setFormError(cause instanceof Error ? cause.message : 'Check the search filters.'); requestAnimationFrame(() => { filterError.current?.focus({ preventScroll: true }); filterError.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }); } }}>Continue to sign in</Link> : <Button type="submit" form="files-filter-form" loading={loading} disabled={!permitted}>Apply filters</Button>}</>}>
      <form ref={filterForm} id="files-filter-form" className="files-filter-surface" onSubmit={submit} aria-label="File search filters">
        <section className="files-filter-group">
          <h3><Icon name="search" size={17} />Content</h3>
          <div className="files-primary-grid">
            <Field autoComplete="off" spellCheck={false} label="Hostname" placeholder="Any hostname" value={draft.host} onChange={event => edit('host', event.target.value)} />
            <Field label="Keywords" placeholder="documentation, report" value={draft.keywords} onChange={event => edit('keywords', event.target.value)} />
            <Field label="Extensions" placeholder="pdf, txt" value={draft.extensions} onChange={event => edit('extensions', event.target.value)} />
            <SelectField label="Extension matching" value={draft.excludeExtensions ? 'exclude' : 'include'} onChange={event => edit('excludeExtensions', event.target.value === 'exclude')}><option value="include">Include these extensions</option><option value="exclude">Exclude these extensions</option></SelectField>
          </div>
        </section>
        <section className="files-filter-group">
          <h3><Icon name="file" size={17} />File size</h3>
          <div className="files-filter-range"><Field label="Size from · MB" type="number" min="0" step="any" placeholder="Any size" value={draft.minSize} onChange={event => edit('minSize', event.target.value)} /><Field label="Size to · MB" type="number" min="0" step="any" placeholder="No limit" value={draft.maxSize} onChange={event => edit('maxSize', event.target.value)} /></div>
        </section>
        <details className="files-filter-details"><summary><Icon name="clock" size={17} /><span>Dates <small>UTC</small></span><Icon name="chevron-down" size={16} /></summary>
          <div className="files-date-grid">
            <fieldset><legend>Discovered · UTC</legend><Field label="From, inclusive" type="datetime-local" step="1" value={draft.discoveredFrom} onChange={event => edit('discoveredFrom', event.target.value)} /><Field label="To, inclusive" type="datetime-local" step="1" value={draft.discoveredTo} onChange={event => edit('discoveredTo', event.target.value)} /></fieldset>
            <fieldset><legend>Last updated · UTC</legend><Field label="From, inclusive" type="datetime-local" step="1" value={draft.updatedFrom} onChange={event => edit('updatedFrom', event.target.value)} /><Field label="To, inclusive" type="datetime-local" step="1" value={draft.updatedTo} onChange={event => edit('updatedTo', event.target.value)} /></fieldset>
          </div>
        </details>
        <details className="files-filter-details"><summary><Icon name="code" size={17} /><span>Advanced metadata</span><Icon name="chevron-down" size={16} /></summary>
          <div className="files-primary-grid">
            <Field label="Stopwords" placeholder="backup, tmp" value={draft.stopWords} onChange={event => edit('stopWords', event.target.value)} />
            <Field label="Storage products" placeholder="azureblobstorage" value={draft.products} onChange={event => edit('products', event.target.value)} />
            <Field label="Alphabets" placeholder="latin" value={draft.alphabets} onChange={event => edit('alphabets', event.target.value)} />
          </div>
        </details>
        <section className="files-filter-group"><h3><Icon name="list" size={17} />Results</h3>
          <div className="files-sorting-grid"><SelectField label="Sort order" value={draft.sort} onChange={event => edit('sort', event.target.value)}><option value="uts:desc">Most recently updated</option><option value="uts:asc">Least recently updated</option><option value="cts:desc">Most recently discovered</option><option value="cts:asc">Earliest discovered</option><option value="size_mb:desc">Largest first</option><option value="size_mb:asc">Smallest first</option></SelectField><SelectField label="Rows per page" value={draft.pageSize} onChange={event => edit('pageSize', event.target.value)}>{[10, 20, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}{![10, 20, 25, 50].includes(Number(draft.pageSize)) && <option value={draft.pageSize}>{draft.pageSize}</option>}</SelectField></div>
        </section>
        <Button variant="ghost" onClick={() => { setDraft({ ...DEFAULT_FILE_DRAFT }); setFormError(''); }}>Clear filters</Button>
        {formError && <div ref={filterError} id="files-filter-error" className="alert alert--error" role="alert" tabIndex={-1}><div><strong className="alert-title">Check your filters</strong><p>{formError}</p></div></div>}
      </form>
    </Dialog>

    {changed && <p className="files-draft-notice">Unapplied changes</p>}
    {!job && restored.restored && <p className="files-draft-notice">Filters restored · Search to load results</p>}
    {loading && <div className="files-loading-bar"><Spinner label={shown ? 'Updating results…' : 'Looking for matching records…'} /><Button variant="secondary" size="sm" onClick={() => void stop()}>Stop waiting</Button></div>}
    {loading && !shown && <Skeleton rows={5} label="Loading search results" />}
    {pausedView && <Alert tone="warning" title="Search stopped">No new result is confirmed. Your filters are preserved; the server may have already processed this request. <Button variant="secondary" size="sm" onClick={() => job && run(job.filter, job.view)}>Run again</Button></Alert>}
    {visibleError && <Alert tone={uncertain ? 'warning' : 'error'} title={uncertain ? 'Search results could not be confirmed' : 'Search could not be completed'} actions={<Button variant="secondary" size="sm" onClick={() => job && run(job.filter, job.view)}>Run again</Button>}>{visibleError.message} Your filters have been kept.{uncertain && ' A search credit may already have been used. Starting again sends a new request.'}</Alert>}

    {shown && response && <section className="files-result-section" data-onboarding="file-results" data-ready={!loading && !previousResults && !changed ? 'true' : 'false'} aria-label={view === 'files' ? 'File results' : 'Bucket results'} aria-busy={loading || undefined}>
      <div className="files-result-heading"><div><h2>{response.result_count.toLocaleString()} {view === 'files' ? 'file' : 'bucket'} {response.result_count === 1 ? 'record' : 'records'}</h2><p>{response.result.length.toLocaleString()} loaded · Page {shown.filter.page ?? 1}{previousResults ? ' · Previous results' : ''}</p></div><Button data-onboarding="export-files" variant="secondary" size="sm" disabled={loading || !response.result.length || previousResults} onClick={() => setExportOpen(true)}>Download records<Icon name="download" size={20} /></Button></div>
      {appliedChips.length > 0 && <div className="files-applied-chips" aria-label="Applied filters"><span>Applied</span>{appliedChips.map(chip => <span key={chip}>{chip}</span>)}</div>}
      {response.result.length > 0 ? view === 'files' ? <div className="files-table-wrap"><table className="files-table"><caption className="files-sr-only">Indexed file records returned by the server</caption><thead><tr><th>File / bucket</th><th>Size</th><th>Type</th><th>Last updated</th></tr></thead><tbody>{(response as BucketResults).result.map((file, index) => <tr key={`${file.host}/${file.container}/${file.key}/${index}`} className="files-interactive-row" onClick={event => { if ((event.target as Element).closest('a,button,input,select,textarea') || window.getSelection()?.toString()) return; setSelected(file); }}><td><div className="files-name-row"><FileGlyph extension={file.extension} /><button type="button" className="files-record-name" title={fileName(file)} onClick={() => setSelected(file)}><FileLabel value={fileName(file)} /></button></div><div className="files-record-path"><FileLabel value={`${bucketIdentity(file.host, file.container) || 'Bucket not provided'}${file.key?.includes('/') ? ` / ${file.key.slice(0, file.key.lastIndexOf('/'))}` : ''}`} /></div></td><td data-label="Size">{fileSize(file.size_mb)}</td><td data-label="Type"><span className="files-extension">{file.extension?.toUpperCase() || 'Not observed'}</span></td><td data-label="Last updated"><time dateTime={file.uts && Number.isFinite(new Date(file.uts * 1000).getTime()) ? new Date(file.uts * 1000).toISOString() : undefined}>{formatTimestamp(file.uts)}</time></td></tr>)}</tbody></table></div> : <div className="files-table-wrap"><table className="files-table files-table--buckets"><caption className="files-sr-only">Bucket groups and observed file counts</caption><thead><tr><th>Bucket / container</th><th>Matching files</th><th>Explore</th></tr></thead><tbody>{(response as BucketAnalytics).result.map((bucket, index) => <tr key={`${bucket.host}/${bucket.container}/${index}`} className={`files-interactive-row ${loading ? 'is-busy' : ''}`} onClick={event => { if (loading || (event.target as Element).closest('a,button,input,select,textarea') || window.getSelection()?.toString()) return; run({ ...shown.filter, host: bucketIdentity(bucket.host, bucket.container), page: 1 }, 'files', true); }}><td><div className="files-bucket-name"><Icon name="database" size={19} /><strong><FileLabel value={bucket.host} /></strong></div>{bucket.container && <span className="files-record-path"><FileLabel value={bucket.container} /></span>}</td><td data-label="Matching files">{bucket.file_count.toLocaleString()}</td><td><Button variant="secondary" size="sm" disabled={loading} onClick={() => run({ ...shown.filter, host: bucketIdentity(bucket.host, bucket.container), page: 1 }, 'files', true)}>Search this bucket<Icon name="arrow" size={15} /></Button></td></tr>)}</tbody></table></div> : <EmptyState title={view === 'files' ? 'No files match this search' : 'No buckets match this search'} description="Try a broader keyword, remove stopwords or adjust the file filters." actions={<Button variant="secondary" onClick={openFilters}>Edit filters</Button>} />}
      <div className={loading ? 'files-pagination-disabled' : ''} inert={loading || undefined}><Pagination page={shown.filter.page ?? 1} pageSize={shown.filter.docs_per_page ?? 20} count={response.result.length} total={response.result_count} maxPage={maxPage} onPageChange={page => run({ ...shown.filter, page }, view)} /></div>

    </section>}

    {!shown && !loading && !visibleError && !pausedView && <section className="files-start-state" aria-labelledby="files-start-heading"><div className="files-start-heading"><span className="files-start-icon"><Icon name={view === 'files' ? 'file' : 'database'} size={23} /></span><div><h2 id="files-start-heading">{view === 'files' ? 'Search indexed files' : 'Search matching buckets'}</h2><p>{view === 'files' ? 'Find a file, inspect its metadata, then explore the storage it belongs to.' : 'Group matching files by bucket, then open a bucket to inspect its records.'}</p></div></div><div className="files-example-grid">{(view === 'files' ? fileExamples : bucketExamples).map(example => <Button key={example.title} variant="secondary" className="files-example" disabled={!permitted} onClick={() => run({ ...filterFromDraft(DEFAULT_FILE_DRAFT), ...example.filter }, view, true)}><span className="files-example-symbol"><Icon name={example.icon} size={20} /></span><span className="files-example-copy"><strong>{example.title}</strong><small>{example.description}</small></span><Icon name="arrow-up-right" size={16} /></Button>)}</div></section>}


    <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected ? middleTruncate(fileName(selected)) : 'File details'} size="lg" className="files-detail-dialog" footer={<Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>}>
      {selected && <div className="stack"><div className="files-detail-title"><FileGlyph extension={selected.extension} /><Badge>{selected.extension?.toUpperCase() || 'File'}</Badge><span>{fileSize(selected.size_mb)}</span></div><dl className="files-detail-facts"><div><dt>Bucket</dt><dd>{selected.host ?? 'Not observed'}</dd></div>{selected.container !== undefined && <div><dt>Container</dt><dd>{selected.container || 'Empty value'}</dd></div>}<div><dt>Object key</dt><dd className="mono files-object-key" tabIndex={selected.key && selected.key.length > 160 ? 0 : undefined}>{selected.key ?? 'Not observed'}</dd></div><div><dt>Protocol</dt><dd>{selected.protocol ?? 'Not observed'}</dd></div><div><dt>Discovered</dt><dd>{formatTimestamp(selected.cts)}</dd></div><div><dt>Last updated</dt><dd>{formatTimestamp(selected.uts)}</dd></div><div><dt>Alphabets</dt><dd>{selected.alphabets?.join(', ') || 'Not observed'}</dd></div>{selected.alias_hosts && <div><dt>Alias hosts</dt><dd>{selected.alias_hosts.length ? selected.alias_hosts.join(', ') : 'None returned'}</dd></div>}</dl><div className="cluster files-detail-actions">{selected.key && <Button variant="secondary" onClick={() => void copy(selected.key!)}><Icon name="copy" size={17} />Copy object key</Button>}<Button variant="secondary" onClick={() => void copy(JSON.stringify(selected, null, 2))}><Icon name="copy" size={20} />Copy metadata</Button>{observedFileUrl(selected) && <a className="button button--secondary" href={observedFileUrl(selected)!} target="_blank" rel="noopener noreferrer">Open observed URL<Icon name="external" size={20} /></a>}</div><details className="files-source-record"><summary><Icon name="code" size={16} /><span>Source metadata</span><Icon name="chevron-down" size={16} /></summary><CodeCanvas content={JSON.stringify(selected, null, 2)} language="json" title="File metadata" onCopy={copy} /></details><p className="muted files-record-note">Indexed metadata · Current file availability may differ.</p></div>}
    </Dialog>
    <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} bucketFilter={shown?.filter ?? job?.filter ?? {}} bucketMode={view} />
    </TabPanel>
  </div>;
}
