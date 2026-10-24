import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Alert, Badge, Button, Checkbox, Dialog, Field, Icon, SelectField, TextArea } from '../../components/ui';
import { buildScanRequest, DEFAULT_SCAN_PORTS, normalizeHost, parseCidr, type ScanDraft, type ScanErrors } from './model';
import { detectTargetColumn, parseCsv } from './csv';

export function ScanFields({ draft, onChange, errors = {}, disabled, updating = false }: { draft: ScanDraft; onChange: (draft: ScanDraft) => void; errors?: ScanErrors; disabled?: boolean; updating?: boolean }) {
  const [importOpen, setImportOpen] = useState(false);
  const fields = useRef<HTMLDivElement>(null), scheduleName = useId();
  useEffect(() => {
    if (!Object.keys(errors).length) return;
    const frame = requestAnimationFrame(() => {
      const first = fields.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      const dialog = first?.closest('dialog');
      if (first && (!dialog || dialog.open)) first.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [errors]);
  return <div ref={fields} className="scanner-form-fields"><section className="scanner-form-section"><div className="scanner-section-heading"><div><h2><Icon name="scan" size={18} />Targets</h2></div><Button variant="secondary" size="sm" disabled={disabled} onClick={() => setImportOpen(true)}><Icon name="download" size={16} />Import CSV</Button></div><TextArea label="Hosts and IP addresses" placeholder={'example.com\n192.0.2.10\n2001:db8::1'} value={draft.hosts} onChange={event => onChange({ ...draft, hosts: event.target.value })} error={errors.hosts || errors.form} hint="One address or hostname per line. Commas and spaces are also accepted." rows={5} disabled={disabled} spellCheck={false} /><TextArea label="CIDR blocks" placeholder={'192.0.2.0/28\n2001:db8::/120'} value={draft.cidrs} onChange={event => onChange({ ...draft, cidrs: event.target.value })} error={errors.cidrs} hint="IPv4 network and broadcast addresses are excluded from the estimate." rows={3} disabled={disabled} spellCheck={false} /></section><section className="scanner-form-section"><div className="scanner-section-heading"><div><h2><Icon name="code" size={18} />Ports</h2></div></div><Field label="Port list" value={draft.ports} onChange={event => onChange({ ...draft, ports: event.target.value })} placeholder="Default: 22, 21, 80, 443, 3306, 5601, 8080, 8443, 9200, 27017" error={errors.ports} hint="Use commas, spaces or numeric ranges, such as 8000–8010 using a hyphen." disabled={disabled} /><div className="scanner-default-ports"><span>{draft.ports.trim() ? 'Default set · used when the port list is empty' : 'Using 10 default ports'}</span>{DEFAULT_SCAN_PORTS.map(port => <Badge key={port}>{port}</Badge>)}</div></section><section className="scanner-form-section"><div className="scanner-section-heading"><div><h2><Icon name="clock" size={18} />Schedule</h2></div></div><fieldset className="scanner-schedule-options" disabled={disabled}><legend className="sr-only">Scan schedule</legend><label><input type="radio" name={scheduleName} value="once" checked={draft.scheduling === 'once'} onChange={() => onChange({ ...draft, scheduling: 'once' })} /><span><strong>{updating ? "Keep current schedule" : "Run once"}</strong><small>{updating ? "Leave the schedule unchanged in this update." : "Start after creation."}</small></span></label><label><input type="radio" name={scheduleName} value="cron" checked={draft.scheduling === 'cron'} onChange={() => onChange({ ...draft, scheduling: 'cron' })} /><span><strong>Custom schedule</strong><small>Six-field Cron, including seconds.</small></span></label></fieldset>{draft.scheduling === 'cron' && <Field label="Cron expression" className="mono" value={draft.cron} onChange={event => onChange({ ...draft, cron: event.target.value })} error={errors.schedule} hint="second minute hour day month weekday · timezone follows the scanner configuration." placeholder="0 0 3 * * *" disabled={disabled} spellCheck={false} />}</section>{importOpen && <ImportTargets open={importOpen} onClose={() => setImportOpen(false)} onImport={(hosts, cidrs) => { onChange({ ...draft, hosts: [draft.hosts, ...hosts].filter(Boolean).join('\n'), cidrs: [draft.cidrs, ...cidrs].filter(Boolean).join('\n') }); setImportOpen(false); }} />}</div>;
}

export function ScanEstimate({ draft, scanCredits, updating = false }: { draft: ScanDraft; scanCredits?: number; updating?: boolean }) {
  const built = useMemo(() => buildScanRequest(draft), [draft]);
  const insufficient = built.estimate !== undefined && scanCredits !== undefined && Number.isSafeInteger(scanCredits) && built.estimate > BigInt(scanCredits);
  return <aside className="scanner-estimate"><Icon name="scan" size={24} /><h2 className="scanner-estimate-heading">{updating ? "Updated scan scope" : "Scan estimate"}</h2><dl><div><dt>Individual hosts</dt><dd>{built.request.host_list?.length || 0}</dd></div><div><dt>CIDR blocks</dt><dd>{built.request.cidr_list?.length || 0}</dd></div><div><dt>{built.unknownCidrs.length ? 'Known targets' : 'Target count'}</dt><dd>{built.knownTargetCount.toLocaleString()}</dd></div><div><dt>Ports per target</dt><dd>{built.request.port_list?.length || 0}</dd></div><div className="scanner-estimated-total"><dt>Estimated credits</dt><dd>{built.valid && built.estimate !== undefined ? built.estimate.toLocaleString() : "—"}</dd></div>{scanCredits !== undefined && built.valid && built.estimate !== undefined && Number.isSafeInteger(scanCredits) && <div><dt>Balance after estimate</dt><dd>{(BigInt(scanCredits) - built.estimate).toLocaleString()}</dd></div>}</dl><p className="scanner-estimate-formula">(Hosts + CIDR addresses) × ports</p>{scanCredits !== undefined && <p className="scanner-estimate-balance">Available: <strong>{scanCredits.toLocaleString()}</strong> scan credits</p>}{built.unknownCidrs.length > 0 && <Alert tone="warning">An exact estimate is unavailable for IPv4 /31 or /32 CIDRs. Enter individual addresses for a precise estimate.</Alert>}{insufficient && <Alert tone="warning">This estimate exceeds the displayed scan-credit balance. The server checks the current balance when you submit.</Alert>}<p className="scanner-estimate-note">Search credits and scan credits are separate. Overlapping targets can be counted more than once.{updating ? ' Updating a task is a zero-cost API action; this estimate describes its scan scope.' : ' The final charge is determined by the server.'}</p></aside>;
}

export function ScanReview({ draft, scanCredits, updating = false }: { draft: ScanDraft; scanCredits?: number; updating?: boolean }) {
  const built = buildScanRequest(draft);
  return <div className="scanner-review"><ScanEstimate draft={draft} scanCredits={scanCredits} updating={updating} /><dl className="scanner-review-scope"><div><dt>Hosts</dt><dd>{built.request.host_list?.length ? <pre>{built.request.host_list.join('\n')}</pre> : 'None'}</dd></div><div><dt>CIDR blocks</dt><dd>{built.request.cidr_list?.length ? <pre>{built.request.cidr_list.join('\n')}</pre> : 'None'}</dd></div><div><dt>Ports</dt><dd>{built.request.port_list?.join(', ')}</dd></div><div><dt>Schedule</dt><dd>{built.request.schedule ? <code>{built.request.schedule}</code> : updating ? 'Keep the current schedule.' : 'One run, shortly after the server accepts the task.'}</dd></div></dl>{built.warnings.map(warning => <Alert tone="info" key={warning}>{warning}</Alert>)}{built.unknownCidrs.map(cidr => <p className="muted" key={cidr.value}>{cidr.value}: {cidr.note}</p>)}<p className="muted">Review the targets, ports and schedule before submitting.</p></div>;
}

function ImportTargets({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (hosts: string[], cidrs: string[]) => void }) {
  const [rows, setRows] = useState<string[][]>([]), [error, setError] = useState(''), [fileName, setFileName] = useState('');
  const [header, setHeader] = useState(false), [column, setColumn] = useState(0), [busy, setBusy] = useState(false);
  const readOperation = useRef(0);
  useEffect(() => () => { readOperation.current++; }, []);
  function close() { readOperation.current++; onClose(); }
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // Retain the File before clearing the native input so the same file can be retried.
    event.currentTarget.value = '';
    if (!file) return;
    const token = ++readOperation.current;
    setBusy(true); setError(''); setRows([]); setFileName(file.name);
    try {
      if (file.size > 5_000_000) throw new Error('The browser importer accepts files up to 5 MB. Split this file before importing.');
      const content = await file.text();
      if (token !== readOperation.current) return;
      const parsed = parseCsv(content);
      if (!parsed.length) throw new Error('The file contains no rows.');
      const detected = detectTargetColumn(parsed);
      setRows(parsed); setColumn(detected.column); setHeader(detected.header);
    } catch (cause) {
      if (token === readOperation.current) setError(cause instanceof Error ? cause.message : 'This CSV file could not be read. Try again.');
    } finally { if (token === readOperation.current) setBusy(false); }
  }
  const columns = useMemo(() => rows.reduce((max, row) => Math.max(max, row.length), 0), [rows]);
  const preview = useMemo(() => {
    const hosts: string[] = [], cidrs: string[] = [], invalid: { row: number; value: string }[] = [];
    rows.slice(header ? 1 : 0).forEach((row, index) => {
      const value = row[column]?.trim(); if (!value) return;
      try { if (value.includes('/')) cidrs.push(parseCidr(value).value); else hosts.push(normalizeHost(value)); } catch { invalid.push({ row: index + (header ? 2 : 1), value }); }
    });
    const uniqueHosts = [...new Set(hosts)], uniqueCidrs = [...new Set(cidrs)];
    return { hosts: uniqueHosts, cidrs: uniqueCidrs, invalid, duplicates: hosts.length + cidrs.length - uniqueHosts.length - uniqueCidrs.length };
  }, [rows, header, column]);
  return <Dialog open={open} onClose={close} title="Import scan targets" size="lg" footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button disabled={busy || (!preview.hosts.length && !preview.cidrs.length)} onClick={() => onImport(preview.hosts, preview.cidrs)}>{preview.invalid.length ? `Use ${preview.hosts.length + preview.cidrs.length} valid targets` : 'Use these targets'}</Button></>}><p>Choose a CSV column containing IP addresses, hostnames or CIDR blocks. The file is read in your browser.</p><Field label="CSV file" type="file" accept=".csv,text/csv" error={error} disabled={busy} onChange={event => void readFile(event)} />{fileName && <p className="muted scanner-import-file-name">{fileName}{rows.length > 0 && ` · ${rows.length.toLocaleString()} rows read`}</p>}{busy && <p className="muted" role="status">Reading CSV…</p>}{rows.length > 0 && <div className="stack"><Checkbox label="The first row contains column names" checked={header} onChange={event => setHeader(event.target.checked)} /><SelectField label="Target column" value={column} onChange={event => setColumn(Number(event.target.value))}>{Array.from({ length: columns }, (_, index) => <option key={index} value={index}>{header ? rows[0]?.[index] || `Column ${index + 1}` : `Column ${index + 1}`}</option>)}</SelectField><div className="scanner-import-summary"><Badge tone="accent">{preview.hosts.length} hosts</Badge><Badge tone="accent">{preview.cidrs.length} CIDRs</Badge>{preview.duplicates > 0 && <Badge>{preview.duplicates} duplicates removed</Badge>}<Badge tone={preview.invalid.length ? 'warning' : 'success'}>{preview.invalid.length} invalid</Badge></div><pre className="scanner-import-preview">{[...preview.hosts, ...preview.cidrs].slice(0, 20).join('\n')}{preview.hosts.length + preview.cidrs.length > 20 ? '\n… Preview shows the first 20 valid targets.' : ''}</pre>{preview.invalid.length > 0 && <Alert tone="warning" title="Some rows cannot be imported">{preview.invalid.slice(0, 8).map(row => <p key={row.row}>Row {row.row}: {row.value}</p>)}<p>“Use valid targets” excludes these invalid values. All accepted targets are shown again in the scan review.</p></Alert>}</div>}</Dialog>;
}
