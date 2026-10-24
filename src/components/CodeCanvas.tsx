import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui';
import { codeWindows, detectCodeLanguage, highlightCodeLine, type CodeLanguage } from './code-canvas-model';
import './code-canvas.css';

export interface CodeCanvasProps {
  content: string;
  language?: CodeLanguage;
  title?: string;
  onCopy?: (text: string) => void | boolean | Promise<void | boolean>;
  className?: string;
  codeClassName?: string;
  lineNumbers?: boolean;
  wrapInitially?: boolean;
  emptyLabel?: string;
}

export function CodeCanvas({ content, language, title, onCopy, className = '', codeClassName = '', lineNumbers = true, wrapInitially = false, emptyLabel = 'Empty content' }: CodeCanvasProps) {
  const syntax = language ?? detectCodeLanguage(content);
  const windows = useMemo(() => codeWindows(content), [content]);
  const [page, setPage] = useState(0), [wrap, setWrap] = useState(wrapInitially), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState('');
  const body = useRef<HTMLPreElement>(null);
  const current = windows[Math.min(page, windows.length - 1)];
  const visible = content.slice(current.start, current.end);
  const lines = useMemo(() => visible.split('\n'), [visible]);
  const paged = windows.length > 1;
  useEffect(() => { setPage(0); setCopied(false); setCopyError(''); }, [content]);
  useEffect(() => { if (!copied) return; const id = window.setTimeout(() => setCopied(false), 1800); return () => clearTimeout(id); }, [copied]);
  const copy = async () => {
    setCopyError(''); setCopied(false);
    try {
      const result = onCopy ? await onCopy(content) : await navigator.clipboard.writeText(content);
      if (result === false) { setCopyError('Copy is unavailable. Select the code to copy it.'); return; }
      setCopied(true);
    }
    catch { setCopyError('Copy is unavailable. Select the code to copy it.'); }
  };
  const changePage = (next: number) => { setPage(next); if (body.current) { body.current.scrollTop = 0; body.current.scrollLeft = 0; } };
  return <div className={`code-canvas ${wrap ? 'is-wrapped' : ''} ${className}`}>
    <div className="code-canvas-toolbar"><div className="code-canvas-caption"><Icon name="code" size={15} /><span>{title || (syntax === 'text' ? 'Plain text' : syntax.toUpperCase())}</span>{title && <small>{syntax === 'text' ? 'Text' : syntax.toUpperCase()}</small>}</div><div className="code-canvas-actions"><button type="button" aria-pressed={wrap} title={wrap ? 'Show original line lengths' : 'Wrap long lines'} onClick={() => setWrap(!wrap)}>Wrap</button><button type="button" onClick={() => void copy()} aria-label={`Copy ${title || 'code'}`}><Icon name={copied ? 'check' : 'copy'} size={14} /><span>{copied ? 'Copied' : 'Copy'}</span></button></div></div>
    <pre ref={body} className={`code-canvas-source ${codeClassName}`} tabIndex={0} aria-label={title ? `${title} source` : 'Source code'}><code>{content === '' ? <span className="code-canvas-empty">{emptyLabel}</span> : lines.map((line, index) => <span className="code-canvas-line" key={`${page}-${index}`}>{lineNumbers && <span className="code-canvas-line-number" aria-hidden="true">{current.line + index}</span>}<span className="code-canvas-line-text">{highlightCodeLine(line, syntax).map((token, tokenIndex) => token.kind ? <span className={`code-token code-token--${token.kind}`} key={tokenIndex}>{token.text}</span> : token.text)}{index < lines.length - 1 ? '\n' : ''}</span></span>)}</code></pre>
    {paged && <div className="code-canvas-pagination"><span aria-live="polite">{(current.start + 1).toLocaleString()}–{current.end.toLocaleString()} of {content.length.toLocaleString()} characters</span><nav aria-label={`${title || 'Code'} pages`}><button type="button" disabled={page <= 0} onClick={() => changePage(page - 1)} aria-label="Previous code page"><Icon name="chevron-left" size={16} /></button><span>{page + 1} / {windows.length}</span><button type="button" disabled={page >= windows.length - 1} onClick={() => changePage(page + 1)} aria-label="Next code page"><Icon name="chevron-right" size={16} /></button></nav>{windows.length > 8 && <form className="code-canvas-jump" onSubmit={event => { event.preventDefault(); const input = event.currentTarget.elements.namedItem('codePage') as HTMLInputElement; const next = Number(input.value); if (Number.isInteger(next) && next >= 1 && next <= windows.length) changePage(next - 1); }}><label>Page<input key={page} type="number" name="codePage" min={1} max={windows.length} required inputMode="numeric" defaultValue={page + 1} aria-label={`Go to ${title || 'code'} page`} /></label><button type="submit">Go</button></form>}</div>}
    {copyError && <p className="code-canvas-error" role="status">{copyError}</p>}
  </div>;
}
