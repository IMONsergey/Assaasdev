import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { BucketFilter, SearchRequest } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Button, Dialog, Field, SelectField } from '../../components/ui';
import { errorMessage } from '../../lib/format';
import { checkpoint, exportLimit, MEMORY_DOWNLOAD_LIMIT, transferExport, trimChunks, validateExport, type DownloadFile, type ExportFormat, type ExportMode, type SavePickerWindow, type WritableFile } from './export';

type Job = { body: object; path: string; name: string; bytes: number; chunks: Uint8Array[]; file?: DownloadFile; resumable: boolean };
export function ExportDialog({ open, onClose, query = {}, privateSearch = false, taskIds, shareToken, bucketFilter, bucketMode = 'files' }: { open: boolean; onClose: () => void; query?: SearchRequest; privateSearch?: boolean; taskIds?: string[]; shareToken?: string; bucketFilter?: BucketFilter; bucketMode?: 'files' | 'hosts' }) {
  const { api, user, session, metadata } = useApp();
  const [format, setFormat] = useState<ExportFormat>('json'), [mode, setMode] = useState<ExportMode>(bucketFilter ? bucketMode : 'partial');
  const [count, setCount] = useState(10000), [status, setStatus] = useState<'idle' | 'preparing' | 'running' | 'complete' | 'interrupted'>('idle');
  const [bytes, setBytes] = useState(0), [error, setError] = useState(''), [disk, setDisk] = useState(false);
  const job = useRef<Job | null>(null), abort = useRef<AbortController | null>(null), busy = useRef(false);
  const nativeSave = typeof (window as unknown as SavePickerWindow).showSaveFilePicker === 'function';
  const allowed = session.status === 'authenticated' && (user?.subscription?.type === 'Business' || metadata?.full_access === true);
  const shared = !!(shareToken || query.st || query.share_token);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { if (open && !busy.current) { setMode(bucketFilter ? bucketMode : 'partial'); setFormat('json'); setCount(10000); setStatus('idle'); setBytes(0); setError(''); job.current = null; } }, [open]);
  async function run(resume = false) {
    if (busy.current) return;
    const validation = validateExport(format, mode, count);
    if (validation && !resume) { setError(validation); return; }
    if (!allowed || shared) return;
    busy.current = true; setError(''); setStatus('preparing');
    const controller = new AbortController(); abort.current = controller;
    let lastProgressUpdate = 0;
    let writer: WritableFile | undefined;
    try {
      if (!resume) {
        const name = `apcosys-${bucketFilter ? 'files' : privateSearch ? 'private' : 'hosts'}-${new Date().toISOString().slice(0, 10)}.${format === 'json' ? 'ndjson' : 'csv'}`;
        const body = structuredClone({ ...(bucketFilter ?? query), ...(taskIds?.length ? { task_ids: taskIds } : {}), format, download_mode: mode, max_documents: count });
        const next: Job = { name, body, path: bucketFilter ? '/download/buckets/stream' : privateSearch ? '/download/private/bulk/stream' : '/download/bulk/stream', bytes: 0, chunks: [], resumable: true };
        if (nativeSave) {
          next.file = await (window as unknown as SavePickerWindow).showSaveFilePicker!({ suggestedName: name, types: [{ description: format === 'json' ? 'Newline-delimited JSON' : 'CSV data', accept: { [format === 'json' ? 'application/x-ndjson' : 'text/csv']: [format === 'json' ? '.ndjson' : '.csv'] } }] });
        }
        controller.signal.throwIfAborted();
        job.current = next;
      }
      const current = job.current;
      if (!current) throw new Error('The original export is no longer available. Start a new export.');
      if (resume && !current.resumable) throw new Error('The saved file could not be verified. Start a new export.');
      const start = resume ? checkpoint(current.bytes) : 0;
      if (current.file) { writer = await current.file.createWritable({ keepExistingData: resume }); controller.signal.throwIfAborted(); await writer.seek(start); await writer.truncate(start); }
      else current.chunks = trimChunks(current.chunks, start);
      current.bytes = start; setBytes(start); setDisk(!!current.file); setStatus('running');
      controller.signal.throwIfAborted();
      await transferExport(api, current.path, current.body, { signal: controller.signal, start, onProgress: progress => {
        current.bytes = progress;
        // Keep streaming exact; update the visible counter at most ten times a second.
        const now = performance.now();
        if (now - lastProgressUpdate >= 100) { lastProgressUpdate = now; setBytes(progress); }
      }, sink: { write: async value => {
        if (writer) await writer.write(value);
        else { if (current.bytes + value.byteLength > MEMORY_DOWNLOAD_LIMIT) throw new Error('This browser’s 32 MiB download buffer is full. Start a smaller export or use a browser with direct file saving.'); current.chunks.push(value.slice()); }
      } } });
      if (writer) {
        const closingWriter = writer; writer = undefined;
        try { await closingWriter.close(); } catch (error) { current.resumable = false; throw error; }
      }
      else {
        const blob = new Blob(current.chunks.map(c => new Uint8Array(c)), { type: format === 'json' ? 'application/x-ndjson' : 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = current.name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000); current.chunks = [];
      }
      setStatus('complete');
    } catch (cause) {
      // Commit only the partial bytes already received; the view clearly labels the file incomplete.
      if (writer) { try { await writer.close(); } catch { if (job.current) job.current.resumable = false; } }
      const cancelled = cause instanceof DOMException && cause.name === 'AbortError';
      if (!job.current) { setStatus('idle'); if (!cancelled) setError(errorMessage(cause)); }
      else { setStatus('interrupted'); setError(!job.current.resumable ? 'The browser could not commit the received bytes to your selected file. Its contents are unverified. Start over with a new export.' : cancelled ? 'Export stopped. The received bytes are incomplete.' : errorMessage(cause)); }
    } finally { setBytes(job.current?.bytes ?? 0); busy.current = false; abort.current = null; }
  }
  const locked = status === 'preparing' || status === 'running' || status === 'interrupted';
  function close() { if (!busy.current) onClose(); }
  return <Dialog open={open} onClose={close} title={bucketFilter ? 'Export bucket data' : 'Export search results'} footer={status === 'preparing' ? <Button variant="secondary" loading>Preparing download</Button> : status === 'running' ? <Button variant="secondary" onClick={() => abort.current?.abort()}>Stop export</Button> : <><Button variant="secondary" onClick={close}>{status === 'complete' ? 'Done' : 'Close'}</Button>{status === 'interrupted' && <><Button variant="secondary" onClick={() => { job.current = null; setStatus('idle'); setBytes(0); setError(''); }}>Start over</Button>{job.current?.resumable && bytes >= 1024 * 1024 && <Button onClick={() => void run(true)}>Resume from checkpoint</Button>}</>}{status === 'idle' && <Button disabled={!allowed || shared} onClick={() => void run()}>Start export</Button>}</>}><div className="stack" data-onboarding="export-dialog" data-export-status={status}>
    {!allowed && <Alert tone="info" title="Business access required">Bulk downloads are available with the Business plan or access granted by your administrator. <Link to="/billing" onClick={onClose}>View plans</Link></Alert>}
    {shared && <Alert tone="warning">A shared search grants access to its fixed result view. Start a search using your own account to export data.</Alert>}
    {status === 'complete' ? <Alert tone="success" title="Export complete">{(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB {disk ? 'saved to your selected file' : 'sent to your browser’s downloads'}.</Alert> : <><div className="form-grid"><SelectField label="Format" value={format} disabled={locked} onChange={e => setFormat(e.target.value as ExportFormat)}><option value="json">NDJSON · one record per line</option><option value="csv" disabled={mode === 'full'}>CSV</option></SelectField><SelectField label="Record detail" value={mode} disabled={locked} onChange={e => { const next = e.target.value as ExportMode; setMode(next); if (next === 'full') setFormat('json'); setCount(value => Math.min(value, exportLimit(next))); }}>{bucketFilter ? <><option value="files">Files</option><option value="hosts">Bucket hosts</option></> : <><option value="partial">Host summaries</option><option value="full">Full host records</option></>}</SelectField></div><Field label="Maximum records" type="number" min={1} max={exportLimit(mode)} value={count} disabled={locked} onChange={e => setCount(Number(e.target.value))} hint={`Up to ${exportLimit(mode).toLocaleString()} records for this export mode.`} />{!nativeSave && <p className="muted">Downloads in this browser are limited to 32 MiB per file. For larger exports, use a browser with direct file saving or export a smaller result set.</p>}{privateSearch && taskIds?.length ? <p className="muted">Limited to {taskIds.length} selected scan {taskIds.length === 1 ? 'task' : 'tasks'}.</p> : null}</>}
    {status === 'preparing' && <p role="status" className="muted">{nativeSave ? 'Choose a destination in the browser’s save dialog. Cancel there to return without starting a download.' : 'Preparing your download…'}</p>}
    {status === 'running' && <div role="status" className="stack stack--small"><progress aria-label="Export in progress" /><strong>{(bytes / 1024 / 1024).toFixed(2)} MiB received</strong><span className="muted">{disk ? 'Writing directly to your selected file.' : 'Receiving the download.'} Keep this page open.</span></div>}
    {error && <Alert tone="warning" title={status === 'idle' ? 'Check export options' : 'Export is incomplete'}>{error}{disk && job.current?.resumable && ' The selected file contains a partial download. Do not treat it as a complete result set.'}{status === 'interrupted' && job.current?.resumable && bytes >= 1024 * 1024 && ' Resume continues from the last complete 1 MiB checkpoint with the same query.'}</Alert>}
  </div></Dialog>;
}
