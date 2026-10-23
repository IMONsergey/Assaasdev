import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../src/api';
import { checkpoint, transferExport, trimChunks, validateExport } from '../src/features/files/export';

describe('download constraints and streaming', () => {
  it('enforces documented per-mode limits and disallows full CSV', () => { expect(validateExport('csv', 'full', 1)).toBeTruthy(); expect(validateExport('json', 'full', 10001)).toBeTruthy(); expect(validateExport('json', 'partial', 1000000)).toBeNull(); expect(validateExport('csv', 'hosts', 10001)).toBeTruthy(); });
  it('resumes from a complete checkpoint without retaining duplicate bytes', () => { expect(checkpoint(1_500_000)).toBe(1_048_576); const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])]; expect(trimChunks(chunks, 3).map(c => [...c])).toEqual([[1, 2], [3]]); });
  it('passes streamed NDJSON through unchanged without parsing it', async () => {
    const raw = '{"ip":"192.0.2.1"}\n{"ip":"192.0.2.2"}\n'; const encoded = new TextEncoder().encode(raw); const received: number[] = [];
    const api = { raw: async () => new Response(new ReadableStream({ start(c) { c.enqueue(encoded.slice(0, 10)); c.enqueue(encoded.slice(10)); c.close(); } }), { headers: { 'Content-Type': 'application/x-ndjson' } }) } as unknown as ApiClient;
    const bytes = await transferExport(api, '/download/bulk/stream', {}, { signal: new AbortController().signal, sink: { write: async value => { received.push(...value); } } });
    expect(bytes).toBe(encoded.byteLength); expect(new TextDecoder().decode(new Uint8Array(received))).toBe(raw);
  });
  it('rejects a server ignoring Range before writing duplicate bytes', async () => {
    let written = 0; const api = { raw: async () => new Response('ignored', { status: 200 }) } as unknown as ApiClient;
    await expect(transferExport(api, '/download/bulk/stream', {}, { start: 1048576, signal: new AbortController().signal, sink: { write: async () => { written++; } } })).rejects.toThrow('did not accept'); expect(written).toBe(0);
  });
  it('never marks an aborted transfer complete', async () => {
    const controller = new AbortController(); let writes = 0;
    const api = { raw: async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.enqueue(new Uint8Array([2])); c.close(); } })) } as unknown as ApiClient;
    await expect(transferExport(api, '/download/bulk/stream', {}, { signal: controller.signal, sink: { write: async () => { writes++; controller.abort(); } } })).rejects.toThrow(); expect(writes).toBe(1);
  });
});
