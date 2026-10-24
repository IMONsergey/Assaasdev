export type CodeLanguage = 'json' | 'http' | 'html' | 'text' | 'shell';
export type CodeToken = { text: string; kind?: 'key' | 'string' | 'number' | 'literal' | 'comment' | 'tag' | 'command' | 'punctuation' };
export type CodeWindow = { start: number; end: number; line: number };

export function detectCodeLanguage(value: string): CodeLanguage {
  const trimmed = value.trimStart();
  if (/^[\[{]/.test(trimmed)) return 'json';
  if (/^(?:HTTP\/\d|(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s)/i.test(trimmed)) return 'http';
  if (/^<(?:!doctype|html|head|body|[a-z][\w:-]*[\s>])/i.test(trimmed)) return 'html';
  if (/^(?:curl|wget|npm|python|export)\s/.test(trimmed)) return 'shell';
  return 'text';
}

/** Bound the mounted source without discarding any part of the original response. */
export function codeWindows(value: string, maxCharacters = 24000, maxLines = 160): CodeWindow[] {
  const windows: CodeWindow[] = [];
  let start = 0, line = 1;
  while (start < value.length) {
    let end = Math.min(start + maxCharacters, value.length), cursor = start, lines = 0;
    while (cursor < end && lines < maxLines) {
      const next = value.indexOf('\n', cursor);
      if (next < 0 || next >= end) break;
      cursor = next + 1; lines++;
    }
    if (lines === maxLines) end = cursor;
    // Do not cut a UTF-16 surrogate pair at a character window boundary.
    if (end < value.length && /[\uD800-\uDBFF]/.test(value.charAt(end - 1))) end--;
    windows.push({ start, end, line });
    for (let index = start; index < end; index++) if (value.charAt(index) === '\n') line++;
    start = end;
  }
  return windows.length ? windows : [{ start: 0, end: 0, line: 1 }];
}

/** Tokens are rendered as React text nodes. Source never enters innerHTML. */
export function highlightCodeLine(line: string, language: CodeLanguage): CodeToken[] {
  if (language === 'text') return [{ text: line }];
  const pattern = language === 'json'
    ? /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b(?:true|false|null)\b)|([{}\[\],:])/g
    : language === 'html'
      ? /(<!--[\s\S]*?-->)|(<\/?[\w:-]+)|([\w:-]+\s*=)|("[^"]*"|'[^']*')|(\/?>)/g
      : language === 'http'
        ? /(^HTTP\/\S+)|(^[\w-]+:)|(\b\d{3}\b)|("(?:\\.|[^"\\])*")/g
        : /(^\s*#.*$)|(\b(?:curl|wget|npm|python|export)\b)|(--?[\w-]+)|("(?:\\.|[^"\\])*"|'[^']*')/g;
  const tokens: CodeToken[] = []; let previous = 0;
  for (const match of line.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > previous) tokens.push({ text: line.slice(previous, at) });
    let kind: CodeToken['kind'];
    if (language === 'json') kind = match[1] ? 'key' : match[2] ? 'string' : match[3] ? 'number' : match[4] ? 'literal' : 'punctuation';
    else if (language === 'html') kind = match[1] ? 'comment' : match[2] ? 'tag' : match[3] ? 'key' : match[4] ? 'string' : 'punctuation';
    else if (language === 'http') kind = match[1] ? 'command' : match[2] ? 'key' : match[3] ? 'number' : 'string';
    else kind = match[1] ? 'comment' : match[2] ? 'command' : match[3] ? 'key' : 'string';
    tokens.push({ text: match[0], kind }); previous = at + match[0].length;
  }
  if (previous < line.length) tokens.push({ text: line.slice(previous) });
  return tokens.length ? tokens : [{ text: line }];
}
