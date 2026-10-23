import type { ApiClient } from '../../api';

export const CHECKPOINT_BYTES = 1024 * 1024;
export const MEMORY_DOWNLOAD_LIMIT = 32 * 1024 * 1024;
export type ExportFormat = 'json' | 'csv';
export type ExportMode = 'partial' | 'full' | 'files' | 'hosts';
export function exportLimit(mode: ExportMode): number { return mode === 'full' || mode === 'hosts' ? 10_000 : 1_000_000; }
export function validateExport(format: ExportFormat, mode: ExportMode, documents: number): string | null {
  if (format === 'csv' && mode === 'full') return 'Full host records are available as NDJSON only.';
  if (!Number.isSafeInteger(documents) || documents < 1 || documents > exportLimit(mode)) return `Choose between 1 and ${exportLimit(mode).toLocaleString()} records.`;
  return null;
}
export function checkpoint(bytes: number): number { return Math.floor(bytes / CHECKPOINT_BYTES) * CHECKPOINT_BYTES; }
export function trimChunks(chunks: Uint8Array[], length: number): Uint8Array[] {
  const output: Uint8Array[] = []; let remaining = length;
  for (const chunk of chunks) { if (remaining <= 0) break; output.push(chunk.byteLength <= remaining ? chunk : chunk.slice(0, remaining)); remaining -= chunk.byteLength; }
  return output;
}
export interface ByteSink { write(bytes: Uint8Array): Promise<void> }
/** Streams unchanged bytes. No JSON envelope parsing, unbounded buffering or automatic restart. */
export async function transferExport(api: ApiClient, path: string, body: unknown, options: { signal: AbortSignal; sink: ByteSink; start?: number; onProgress?: (bytes: number) => void }): Promise<number> {
  const start = options.start ?? 0;
  if (start < 0 || start % CHECKPOINT_BYTES !== 0) throw new Error('Resume offset must be a complete 1 MiB checkpoint.');
  const response = await api.raw(path, { method: 'POST', body, mutation: false, signal: options.signal, headers: start ? { Range: `bytes=${start}-` } : undefined });
  if (start && response.status !== 206) throw new Error('The server did not accept the resume checkpoint. Start a new export to avoid duplicating bytes.');
  const range = response.headers.get('Content-Range');
  if (start && range && !range.startsWith(`bytes ${start}-`)) throw new Error('The server resumed from a different byte offset. Start a new export.');
  const type = response.headers.get('Content-Type')?.toLowerCase() || '';
  if (type.includes('text/html')) throw new Error('The download endpoint returned a web page. Check the API connection.');
  if (!response.body) throw new Error('The server returned no download stream.');
  const reader = response.body.getReader(); let transferred = start;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  options.signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      options.signal.throwIfAborted();
      const result = await reader.read();
      options.signal.throwIfAborted();
      if (result.done) break;
      await options.sink.write(result.value);
      transferred += result.value.byteLength;
      options.onProgress?.(transferred);
    }
    return transferred;
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { options.signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

export interface WritableFile { write(data: Uint8Array): Promise<void>; seek(position: number): Promise<void>; truncate(size: number): Promise<void>; close(): Promise<void> }
export interface DownloadFile { createWritable(options?: { keepExistingData?: boolean }): Promise<WritableFile> }
export interface SavePickerWindow { showSaveFilePicker?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<DownloadFile> }
