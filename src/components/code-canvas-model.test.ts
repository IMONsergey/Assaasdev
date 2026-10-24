import { describe, expect, it } from 'vitest';
import { codeWindows, detectCodeLanguage, highlightCodeLine } from './code-canvas-model';

describe('code canvas source fidelity', () => {
  it('keeps complete source across bounded windows including an oversized line and emoji', () => {
    const source = `${'a'.repeat(23999)}🧭${'b'.repeat(50000)}\n${Array.from({length:1000},(_,n)=>`{"row":${n}}`).join('\n')}`;
    const windows = codeWindows(source);
    expect(windows.map(window=>source.slice(window.start,window.end)).join('')).toBe(source);
    expect(windows.every(window=>window.end-window.start<=24000)).toBe(true);
    expect(windows.every(window=>!/[\uD800-\uDBFF]/.test(source.charAt(window.end-1)))).toBe(true);
    expect(windows.every(window=>source.slice(window.start,window.end).split('\n').length<=161)).toBe(true);
  });
  it('highlights JSON without modifying secrets, escaped strings or HTML content', () => {
    const line = '  "body": "<script>alert(1)</script>\\n\\\"key\\\"", "ok": true, "count": 0, "none": null';
    const tokens = highlightCodeLine(line,'json');
    expect(tokens.map(token=>token.text).join('')).toBe(line);
    expect(tokens.some(token=>token.kind==='key')).toBe(true);
    expect(tokens.some(token=>token.kind==='string')).toBe(true);
    expect(tokens.some(token=>token.kind==='number'&&token.text==='0')).toBe(true);
  });
  it('detects formats while retaining empty and arbitrary plain text', () => {
    expect(detectCodeLanguage('HTTP/1.1 200 OK\nServer: nginx')).toBe('http');
    expect(detectCodeLanguage('<main>Content</main>')).toBe('html');
    expect(detectCodeLanguage('{"ok":true}')).toBe('json');
    expect(detectCodeLanguage('')).toBe('text');
    expect(codeWindows('')).toEqual([{start:0,end:0,line:1}]);
    expect(highlightCodeLine('User-agent: *','text')).toEqual([{text:'User-agent: *'}]);
  });
});
