import type { PlanningTask, PrivateTask, PrivateTaskRequest } from '../../api';
import { isApiError } from '../../api';

export const DEFAULT_SCAN_PORTS = [22, 21, 80, 443, 3306, 5601, 8080, 8443, 9200, 27017] as const;
export interface ScanDraft { hosts: string; cidrs: string; ports: string; scheduling: 'once' | 'cron'; cron: string }
export const EMPTY_SCAN_DRAFT: ScanDraft = { hosts: '', cidrs: '', ports: '', scheduling: 'once', cron: '0 0 3 * * *' };
export type ScanErrors = Partial<Record<'hosts' | 'cidrs' | 'ports' | 'schedule' | 'form', string>>;
export interface CidrInfo { value: string; family: 4 | 6; prefix: number; count?: bigint; note?: string }

function tokens(value: string): string[] { return value.split(/[\s,;]+/).map(item => item.trim()).filter(Boolean); }
function unique(values: string[]) { return [...new Set(values)]; }
function ipv4(value: string): boolean { const parts = value.split('.'); return parts.length === 4 && parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255); }

export function normalizeHost(value: string): string {
  const input = value.trim();
  if (!input || /[\s/\\@?#]/.test(input)) throw new Error(`“${input}” must be an IP address or hostname without a URL, path or port.`);
  if (input.includes(':')) {
    try { const url = new URL(`http://[${input.replace(/^\[|\]$/g, '')}]/`); return url.hostname.replace(/^\[|\]$/g, ''); } catch { throw new Error(`“${input}” is not a valid IPv6 address. Put ports in the Ports field.`); }
  }
  if (/^[\d.]+$/.test(input)) { if (!ipv4(input)) throw new Error(`“${input}” is not a valid IPv4 address.`); return input; }
  let host: string;
  try { host = new URL(`http://${input}/`).hostname.toLowerCase().replace(/\.$/, ''); } catch { throw new Error(`“${input}” is not a valid hostname.`); }
  if (host.length > 253 || !host.split('.').every(part => part.length > 0 && part.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(part))) throw new Error(`“${input}” is not a valid hostname.`);
  return host;
}

export function parseCidr(value: string): CidrInfo {
  const parts = value.split('/');
  if (parts.length !== 2 || !/^\d+$/.test(parts[1])) throw new Error(`“${value}” needs an IP address and a prefix, for example 192.0.2.0/28.`);
  const host = normalizeHost(parts[0]), prefix = Number(parts[1]);
  const family = ipv4(host) ? 4 : host.includes(':') ? 6 : undefined;
  if (!family || prefix < 0 || prefix > (family === 4 ? 32 : 128)) throw new Error(`“${value}” is not a valid IPv4 or IPv6 CIDR block.`);
  if (family === 4 && prefix >= 31) return { value: `${host}/${prefix}`, family, prefix, note: 'The documented network/broadcast exclusion does not define /31 and /32 boundaries. Enter individual addresses for an exact estimate.' };
  const total = 1n << BigInt((family === 4 ? 32 : 128) - prefix);
  return { value: `${host}/${prefix}`, family, prefix, count: family === 4 ? total - 2n : total };
}

export function parsePorts(value: string): number[] {
  if (!value.trim()) return [...DEFAULT_SCAN_PORTS];
  const ports = new Set<number>();
  for (const token of tokens(value)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(token);
    if (!match) throw new Error(`“${token}” is not a port or a numeric port range.`);
    const from = Number(match[1]), to = Number(match[2] ?? match[1]);
    if (from < 1 || to > 65535 || from > to) throw new Error('Ports must be between 1 and 65535; a range must be in ascending order.');
    for (let port = from; port <= to; port++) ports.add(port);
  }
  return [...ports];
}

/** Validates the documented six-field shape; the scanner validates its dialect and timezone. */
export function validateCron(value: string): string {
  const schedule = value.trim().replace(/\s+/g, ' '), fields = schedule.split(' ');
  if (fields.length !== 6) throw new Error('Use six Cron fields: second minute hour day month weekday.');
  if (fields.some(field => !/^[\dA-Za-z*?,/\-#]+$/.test(field))) throw new Error('Check the Cron expression. Use six fields separated by spaces.');
  const limits = [[0, 59], [0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  fields.forEach((field, index) => {
    for (const token of field.split(',')) {
      const [base, step, ...extra] = token.split('/');
      if (extra.length || (step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1))) throw new Error('A Cron step must be a positive whole number.');
      if (/^\d+(?:-\d+)?$/.test(base)) {
        const [low, high = low] = base.split('-').map(Number);
        if (low < limits[index][0] || high > limits[index][1] || low > high) throw new Error(`Cron field ${index + 1} is outside its allowed numeric range.`);
      }
      if (!base) throw new Error('Cron fields cannot contain an empty list item.');
    }
  });
  return schedule;
}

export function buildScanRequest(draft: ScanDraft, id?: string) {
  const errors: ScanErrors = {}, warnings: string[] = [];
  let hosts: string[] = [], cidrs: CidrInfo[] = [], ports: number[] = [], schedule = '';
  try { const raw = tokens(draft.hosts); hosts = unique(raw.map(normalizeHost)); if (hosts.length !== raw.length) warnings.push(`${raw.length - hosts.length} duplicate host entries were removed.`); } catch (cause) { errors.hosts = (cause as Error).message; }
  try { const raw = tokens(draft.cidrs); cidrs = unique(raw.map(value => parseCidr(value).value)).map(parseCidr); if (raw.length !== cidrs.length) warnings.push(`${raw.length - cidrs.length} duplicate CIDR entries were removed.`); } catch (cause) { errors.cidrs = (cause as Error).message; }
  try { ports = parsePorts(draft.ports); } catch (cause) { errors.ports = (cause as Error).message; }
  if (draft.scheduling === 'cron') try { schedule = validateCron(draft.cron); } catch (cause) { errors.schedule = (cause as Error).message; }
  if (!hosts.length && !cidrs.length && !errors.hosts && !errors.cidrs) errors.form = 'Add at least one host or CIDR block.';
  const unknownCidrs = cidrs.filter(cidr => cidr.count === undefined);
  const knownTargetCount = BigInt(hosts.length) + cidrs.reduce((sum, cidr) => sum + (cidr.count || 0n), 0n);
  const estimate = unknownCidrs.length ? undefined : knownTargetCount * BigInt(ports.length);
  const request: PrivateTaskRequest = { ...(id ? { id } : {}), host_list: hosts, cidr_list: cidrs.map(cidr => cidr.value), port_list: ports, ...(!id || draft.scheduling === 'cron' ? { schedule } : {}) };
  return { request, errors, warnings, cidrs, knownTargetCount, estimate, unknownCidrs, valid: Object.keys(errors).length === 0 };
}

export function taskProgress(task: PrivateTask): number | undefined {
  return task.task_count !== undefined && task.task_count > 0 && task.done_task_count !== undefined ? Math.max(0, Math.min(100, task.done_task_count / task.task_count * 100)) : undefined;
}
export function taskGroup(status: string | undefined): 'active' | 'history' | 'other' {
  if (['running', 'pending', 'queued', 'started', 'in_progress', 'scheduled'].includes((status || '').toLowerCase())) return 'active';
  if (['complete', 'completed', 'done', 'finished', 'failed', 'error', 'cancelled', 'canceled'].includes((status || '').toLowerCase())) return 'history';
  return 'other';
}
export function taskResultsLabel(task: PrivateTask): string { return task.result_count !== undefined ? task.result_count.toLocaleString() : task.has_results === true ? 'Available' : task.has_results === false ? 'None stored' : 'Not provided'; }
export function taskHasResults(task: PrivateTask): boolean { return task.has_results === true || (task.result_count !== undefined && task.result_count > 0); }
export function scheduleLabel(schedule: string | undefined): string {
  if (schedule === undefined) return 'Not provided';
  if (schedule === '') return 'One-time scan';
  const normalized = schedule.trim().replace(/\s+/g, ' ');
  if (normalized === '0 * * * * *') return 'Every minute';
  if (normalized === '0 0 * * * *') return 'Every hour';
  const daily = /^0 ([0-5]?\d) ([01]?\d|2[0-3]) \* \* \*$/.exec(normalized);
  if (daily) return `Daily at ${daily[2].padStart(2, '0')}:${daily[1].padStart(2, '0')} (scanner time)`;
  return 'Custom schedule';
}
export function draftFromTask(task: PrivateTask | PlanningTask): ScanDraft { return { hosts: (task.host_list || []).join('\n'), cidrs: (task.cidr_list || []).join('\n'), ports: task.port_list?.join(', ') || '', scheduling: task.schedule ? 'cron' : 'once', cron: task.schedule || '0 0 3 * * *' }; }
export function sameScope(task: PrivateTask | PlanningTask, request: PrivateTaskRequest): boolean {
  const same = (a: (string | number)[] | undefined, b: (string | number)[] | undefined) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
  return same(task.host_list, request.host_list) && same(task.cidr_list, request.cidr_list) && same(task.port_list, request.port_list) && (request.schedule === undefined || task.schedule === request.schedule);
}

/** A lost creation response can be reconciled only to one unambiguous new task. */
export function findCreatedTask(tasks: (PrivateTask | PlanningTask)[], request: PrivateTaskRequest, knownIds: string[]): PrivateTask | PlanningTask | undefined {
  const known = new Set(knownIds);
  const matches = new Map(tasks.filter(task => !known.has(task.id) && sameScope(task, request)).map(task => [task.id, task]));
  return matches.size === 1 ? [...matches.values()][0] : undefined;
}

/** Transport, rate and malformed-response failures do not establish a plan restriction. */
export function scannerAccessDenied(error: unknown): boolean {
  return isApiError(error) && error.kind === 'server' && (error.status === 403 || error.message.trim().toLowerCase() === 'business subscription required');
}
