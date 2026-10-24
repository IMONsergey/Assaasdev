import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router';
import { CodeCanvas } from '../../components/CodeCanvas';
import { Badge, Button, Icon, Tabs, TabPanel } from '../../components/ui';
import {
  API_BASE_URL, API_DOCS_SOURCE, API_ENDPOINTS, API_ERRORS, API_PLANS, DOC_TOPICS,
  RESTRICTED_FIELDS, RESTRICTED_VALUES, buildApiExample, docHref, filterGroups,
  filterShape, rangeShape, resolveDocTopic, resolveDocSelection, searchDocSelection, searchDocTopics,
  type ApiEndpoint, type DocField, type DocSelection, type ExampleLanguage, type SchemaGroup,
} from './api-docs-model';
import './api-docs.css';

const languages = [{ id: 'curl', label: 'cURL' }, { id: 'javascript', label: 'JavaScript' }, { id: 'python', label: 'Python' }];

function DocLink({ id, children }: { id: string; children: ReactNode }) {
  return <Link to={docHref(id)} state={{ preserveTabFocus: true }}>{children}</Link>;
}

function FieldTable({ fields, caption, selectedField }: { fields: DocField[]; caption: string; selectedField?: string }) {
  return <div className="api-docs-fields" role="region" aria-label={caption}>
    <table><caption className="sr-only">{caption}</caption><thead><tr><th scope="col">Field</th><th scope="col">Description</th></tr></thead><tbody>
      {fields.map(item => <tr key={item.name} tabIndex={selectedField === item.name ? -1 : undefined} data-doc-match={selectedField === item.name || undefined}><th scope="row"><code>{item.name}</code><span className="api-docs-field-meta">{item.type}{item.required && <strong>Required</strong>}</span></th><td><p>{item.description}</p>{item.defaultValue !== undefined && <span className="api-docs-field-default">Default: <code>{item.defaultValue}</code></span>}{item.access && <span className="api-docs-field-access">{item.access}</span>}</td></tr>)}
    </tbody></table>
  </div>;
}

function Schema({ groups, selection }: { groups: SchemaGroup[]; selection?: DocSelection }) {
  return <div className="api-docs-schema">{groups.map((group, index) => index === 0 ? <section key={group.title}><h3>{group.title}</h3>{group.note && <p className="api-docs-note">{group.note}</p>}<FieldTable fields={group.fields} caption={`${group.title} fields`} selectedField={selection?.group === group.title ? selection.field : undefined} /></section> : <details className="api-docs-details" key={group.title} open={selection?.group === group.title || undefined}><summary><span>{group.title}<small>{group.fields.length} fields</small></span><Icon name="chevron-down" size={17} /></summary>{group.note && <p className="api-docs-note">{group.note}</p>}<FieldTable fields={group.fields} caption={`${group.title} fields`} selectedField={selection?.group === group.title ? selection.field : undefined} /></details>)}</div>;
}

function RequestExample({ endpoint, id = endpoint.id }: { endpoint: ApiEndpoint; id?: string }) {
  const [language, setLanguage] = useState<ExampleLanguage>('curl');
  const examples = useMemo(() => ({ curl: buildApiExample(endpoint, 'curl'), javascript: buildApiExample(endpoint, 'javascript'), python: buildApiExample(endpoint, 'python') }), [endpoint]);
  const reservedLines = Math.max(...Object.values(examples).map(content => content.split('\n').length));
  const prefix = `api-example-${id}`;
  return <section className="api-docs-example" style={{ '--api-example-lines': reservedLines } as CSSProperties} aria-label="Request examples">
    <div className="api-docs-example-heading"><h3>Example request</h3><span>Set <code>APCOSYS_API_KEY</code> in your environment.</span></div>
    <Tabs idPrefix={prefix} ariaLabel="Example language" items={languages} value={language} onChange={next => setLanguage(next as ExampleLanguage)} variant="segmented" />
    {languages.map(item => <TabPanel key={item.id} idPrefix={prefix} value={item.id} hidden={language !== item.id}>{language === item.id && <CodeCanvas content={examples[language]} language={language === 'curl' ? 'shell' : 'text'} title={item.label} className="api-docs-code" />}</TabPanel>)}
    <p className="api-docs-note">Run examples on your server with an environment key. This page does not send API requests.</p>
  </section>;
}

function focusSelectedReferenceTab(prefix: string) {
  const focused = document.activeElement;
  if (!focused?.id.startsWith(`${prefix}-tab-`)) return;
  focused.closest('[role="tablist"]')?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
}

function EndpointArticle({ endpoint, selection, onViewChange }: { endpoint: ApiEndpoint; selection: DocSelection; onViewChange: (view: DocSelection['view']) => void }) {
  const view = selection.view;
  const prefix = `api-reference-${endpoint.id}`;
  useLayoutEffect(() => focusSelectedReferenceTab(prefix), [prefix, view]);
  useEffect(() => {
    let frame = 0;
    // A fast Back can cancel the router's pending Request/Response render. The
    // committed view then stays unchanged even though the click moved focus.
    const restore = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => focusSelectedReferenceTab(prefix)); };
    window.addEventListener('popstate', restore);
    return () => { window.removeEventListener('popstate', restore); cancelAnimationFrame(frame); };
  }, [prefix]);
  return <>
    <div className="api-docs-endpoint-path"><span className={`api-docs-method api-docs-method--${endpoint.method.toLowerCase()}`}>{endpoint.method}</span><code>/api/v1{endpoint.path}</code></div>
    <div className="api-docs-meta"><Badge>{endpoint.access}</Badge><span>{endpoint.cost} {endpoint.cost === 1 ? 'allowance unit' : 'allowance units'} per request</span><DocLink id="authentication">X-API-Key required</DocLink></div>
    {endpoint.notes && <ul className="api-docs-notes">{endpoint.notes.map(note => <li key={note}>{note}</li>)}</ul>}
    <Tabs idPrefix={prefix} ariaLabel={`${endpoint.title} reference`} items={[{ id: 'request', label: 'Request' }, { id: 'response', label: 'Response' }]} value={view} onChange={next => onViewChange(next as DocSelection['view'])} />
    <TabPanel idPrefix={prefix} value="request" hidden={view !== 'request'}>
      <RequestExample endpoint={endpoint} />
      <section className="api-docs-section"><div className="api-docs-section-heading"><h3>{endpoint.method === 'GET' ? 'Path parameter' : 'Request body'}</h3>{endpoint.method === 'POST' && <span>JSON · fields are optional</span>}</div><FieldTable fields={endpoint.request} caption={`${endpoint.title} request parameters`} selectedField={view === 'request' ? selection.field : undefined} /></section>
      {endpoint.group !== 'Buckets' && endpoint.method === 'POST' && <p className="api-docs-next-note"><Icon name="info" size={16} /><span>For condition groups, field names and ranges, see <DocLink id="filters">Filters & syntax</DocLink>.</span></p>}
    </TabPanel>
    <TabPanel idPrefix={prefix} value="response" hidden={view !== 'response'}>
      <section className="api-docs-section"><div className="api-docs-section-heading"><h3>200 OK</h3><span>Illustrative response · values are examples</span></div><CodeCanvas content={JSON.stringify(endpoint.exampleResponse, null, 2)} language="json" title="Response example" className="api-docs-code" /></section>
      <Schema groups={endpoint.response} selection={view === 'response' ? selection : undefined} />
      <p className="api-docs-next-note"><Icon name="info" size={16} /><span>Non-success responses contain an <code>error</code> string. See <DocLink id="errors">Errors</DocLink> for status codes.</span></p>
    </TabPanel>
  </>;
}

function GettingStarted() {
  return <>
    <div className="api-docs-base-url"><span>Base URL</span><CodeCanvas content={API_BASE_URL} language="text" title="API v1" lineNumbers={false} /></div>
    <ol className="api-docs-steps">
      <li><span>1</span><div><h3>Get your API key</h3><p>API access starts with Plus. Open <Link to="/api?section=key" state={{ preserveTabFocus: true }}>API key</Link> and store the key in your server environment as <code>APCOSYS_API_KEY</code>.</p></div></li>
      <li><span>2</span><div><h3>Send a request</h3><p>Every protected endpoint uses the <code>X-API-Key</code> header. POST bodies are JSON. Start with the host-search example below.</p></div></li>
      <li><span>3</span><div><h3>Read the response</h3><p>Host search returns <code>hosts</code>, <code>total</code>, <code>page</code> and <code>docs_per_page</code>. Move through results with <code>page</code>; keep host page size at 100 or below.</p></div></li>
    </ol>
    <RequestExample endpoint={API_ENDPOINTS[0]} id="quickstart" />
    <div className="api-docs-start-links"><DocLink id="search-hosts"><Icon name="search" size={18} /><span><strong>Host search</strong><small>Parameters and response</small></span><Icon name="arrow" size={17} /></DocLink><DocLink id="search-buckets"><Icon name="folder" size={18} /><span><strong>Bucket search</strong><small>Files, size and geography</small></span><Icon name="arrow" size={17} /></DocLink></div>
    <p className="api-docs-note">Check <DocLink id="limits">Plans & limits</DocLink> before batching requests. The reference examples do not run requests or use your account key.</p>
  </>;
}

function Authentication() {
  return <>
    <p>Send the account key in <code>X-API-Key</code> on every protected request. Missing or invalid credentials return <code>401</code>.</p>
    <CodeCanvas content={'X-API-Key: YOUR_API_KEY'} language="http" title="Authentication header" lineNumbers={false} />
    <section className="api-docs-section"><h3>Manage the key</h3><p>Open the <Link to="/api?section=key" state={{ preserveTabFocus: true }}>API key</Link> tab to reveal, copy or rotate your key. Rotating it invalidates the previous key; update your integrations afterward.</p></section>
    <section className="api-docs-section"><h3>Use environment variables</h3><p>The examples read <code>APCOSYS_API_KEY</code> from the environment. Set it on your server. Keep it out of shared URLs, logs, source control and client-side code.</p></section>
    <section className="api-docs-section"><h3>Plan access</h3><p>Plus, Expert and Business include API access. Free accounts can read this documentation but cannot call the API. The three private-search endpoints require Business.</p><DocLink id="limits">Compare API limits <Icon name="arrow" size={15} /></DocLink></section>
  </>;
}

const nestedExample = { simple_search_filters: [{ operator: 'OR', filters: [{ field: 'port', value: '80' }, { field: 'port', value: '443' }] }, { field: 'country_code', value: 'DE' }] };
function Filters({ selection }: { selection: DocSelection }) {
  return <>
    <p>Host search and analytics share the same filter model. Bucket endpoints use their own <DocLink id="search-buckets">request fields</DocLink>.</p>
    <section className="api-docs-section"><h3>Combine conditions</h3><p>Use a nonempty <code>field</code> and <code>value</code> for each leaf. Use <code>operator</code> with nested <code>filters</code> to combine groups.</p><FieldTable fields={filterShape} caption="Search filter shape" /><CodeCanvas content={JSON.stringify(nestedExample, null, 2)} language="json" title="Ports 80 or 443, in Germany" /></section>
    <section className="api-docs-section"><h3>Value syntax</h3><div className="api-docs-table-wrap" tabIndex={0} role="region" aria-label="API value syntax"><table className="api-docs-table"><thead><tr><th>Syntax</th><th>Meaning</th><th>Example</th></tr></thead><tbody><tr><td>Plain text</td><td>Term or text match, depending on field type</td><td><code>nginx</code></td></tr><tr><td>Quoted text</td><td>Exact phrase in a text field</td><td><code>"Welcome to nginx"</code></td></tr><tr><td>Parentheses</td><td>All words must match in a text field</td><td><code>(apache httpd)</code></td></tr><tr><td>Wildcards</td><td><code>*</code> and <code>?</code> on keyword fields/subfields</td><td><code>CVE-2021-*</code></td></tr><tr><td>Comma-separated</td><td>Multiple values joined with OR</td><td><code>80,443</code></td></tr></tbody></table></div></section>
    <section className="api-docs-section"><h3>Inclusive ranges</h3><p>Use <code>range_filter</code> for numeric values and Unix timestamps in seconds. Plan restrictions also apply to fields inside ranges.</p><FieldTable fields={rangeShape} caption="Range filter shape" /></section>
    <section className="api-docs-section"><h3>HTTP headers</h3><p>Use <code>headers.k</code> for an exact header name, <code>headers.v</code> for a text value, or <code>headers.&#123;Name&#125;</code> for both together.</p><CodeCanvas content={JSON.stringify({ simple_search_filters: [{ field: 'headers.Server', value: 'nginx' }] }, null, 2)} language="json" title="Server header contains nginx" /></section>
    <section className="api-docs-section"><h3>Available search fields</h3><p>Current names are <code>products</code>, <code>vendors</code>, <code>cve_id</code> and <code>headers</code>. Avoid legacy names such as <code>product_name</code>, <code>vendor_name</code> and <code>product_cve</code>.</p><Schema groups={filterGroups} selection={selection} /></section>
  </>;
}

function Limits() {
  return <>
    <p>The subscription controls API access, request rate, search pagination and restricted fields. Current account details are in <Link to="/api?section=usage" state={{ preserveTabFocus: true }}>Usage & limits</Link>.</p>
    <section className="api-docs-section"><h3>Subscription limits</h3><div className="api-docs-table-wrap" tabIndex={0} role="region" aria-label="API subscription limits"><table className="api-docs-table"><thead><tr><th>Plan</th><th>API access</th><th>Requests/sec</th><th>Search pages</th><th>Private search</th></tr></thead><tbody>{API_PLANS.map(plan => <tr key={plan.name}><th scope="row">{plan.name}</th><td>{plan.api ? 'Included' : 'Unavailable'}</td><td>{plan.rps}</td><td>{plan.pages}</td><td>{plan.private ? 'Included' : 'Unavailable'}</td></tr>)}</tbody></table></div><p className="api-docs-note">RPS limits are approximate. Exceeding the allowance returns 429. Search-page limits apply to pagination using page and docs_per_page; Free has no API access.</p></section>
    <section className="api-docs-section"><h3>Method costs</h3><div className="api-docs-table-wrap" tabIndex={0} role="region" aria-label="API method allowance costs"><table className="api-docs-table"><thead><tr><th>Method</th><th>Allowance cost</th></tr></thead><tbody><tr><td>Host search</td><td>1</td></tr><tr><td>Host analytics</td><td>3</td></tr><tr><td>Bucket search</td><td>1</td></tr><tr><td>Bucket analytics</td><td>1</td></tr><tr><td>Other endpoints</td><td>1</td></tr></tbody></table></div><p className="api-docs-note">Costs are documented as units of rate allowance. They are not currency amounts.</p></section>
    <section className="api-docs-section"><h3>Restricted fields</h3><RestrictionTable rows={RESTRICTED_FIELDS} label="Search fields" /><p className="api-docs-note">Restrictions apply to simple_search_filters, restricted top-level fields and range_filter. Business has no field restrictions.</p></section>
    <section className="api-docs-section"><h3>Restricted values</h3><RestrictionTable rows={RESTRICTED_VALUES} label="Search values" /><p className="api-docs-note">Value restrictions apply to conditions and product/exposed-data search. Business has no value restrictions.</p></section>
    <section className="api-docs-section"><h3>Response visibility</h3><p>Host details expose <code>ports[].detected_products[].exposed_data</code> only on Expert and Business. Other documented product fields remain visible.</p></section>
    <p className="api-docs-next-note"><Icon name="info" size={16} /><span>A disallowed search field or value returns <code>402</code>. See <DocLink id="errors">Errors</DocLink> for handling.</span></p>
  </>;
}
function RestrictionTable({ rows, label }: { rows: readonly { fields: string; access: string }[]; label: string }) {
  return <div className="api-docs-table-wrap" tabIndex={0} role="region" aria-label={`${label} access restrictions`}><table className="api-docs-table"><thead><tr><th>{label}</th><th>Available on</th></tr></thead><tbody>{rows.map(row => <tr key={row.fields}><td><code>{row.fields}</code></td><td>{row.access}</td></tr>)}</tbody></table></div>;
}

function Errors() {
  return <>
    <p>Error responses are JSON objects with an <code>error</code> string. Check the HTTP status before parsing the expected success schema.</p>
    <CodeCanvas content={JSON.stringify({ error: 'host not found' }, null, 2)} language="json" title="Example error response · 404" />
    <div className="api-docs-errors">{API_ERRORS.map(error => <section key={error.code}><span className="api-docs-status">{error.code}</span><div><h3>{error.title}</h3><p>{error.description}</p><p className="api-docs-note">{error.action}</p></div></section>)}</div>
    <section className="api-docs-section"><h3>Plan errors</h3><p>A 402 response identifies the restricted field or search value in its message. Verify both against <DocLink id="limits">Plans & limits</DocLink> before sending the request again.</p></section>
  </>;
}

export function ApiDocumentation() {
  const location = useLocation(), navigate = useNavigate(), navigation = useNavigationType();
  const [query, setQuery] = useState(''), [navigationOpen, setNavigationOpen] = useState(false), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState('');
  const article = useRef<HTMLElement>(null), navigated = useRef(false), searchInput = useRef<HTMLInputElement>(null), initial = useRef(true), copyOperation = useRef(0);
  const topic = resolveDocTopic(location.hash);
  const selection = useMemo(() => resolveDocSelection(topic, new URLSearchParams(location.search)), [topic, location.search]);
  const previousTopic = useRef(topic.id);
  const results = useMemo(() => searchDocTopics(query), [query]);
  const groups = useMemo(() => Array.from(new Set(results.map(item => item.group))), [results]);
  useEffect(() => {
    copyOperation.current++;
    setCopied(false); setCopyError('');
    const changed = previousTopic.current !== topic.id;
    previousTopic.current = topic.id;
    const wasInitial = initial.current;
    const scroll = navigated.current || (changed && navigation !== 'POP') || (wasInitial && Boolean(selection.field));
    initial.current = false; navigated.current = false;
    const restore = !wasInitial && navigation === 'POP' && document.activeElement === document.body;
    if (!scroll && !restore) return;
    const focus = () => {
      const target = article.current?.querySelector<HTMLElement>('[data-doc-match="true"]') ?? article.current;
      for (let parent = target?.parentElement; parent && parent !== article.current; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      target?.focus({ preventScroll: true });
      if (scroll) target?.scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    const shell = article.current?.closest('.app-shell');
    if (!shell?.hasAttribute('inert')) { focus(); return; }
    const observer = new MutationObserver(() => { if (!shell.hasAttribute('inert')) { observer.disconnect(); focus(); } });
    observer.observe(shell, { attributes: true, attributeFilter: ['inert'] });
    return () => observer.disconnect();
  }, [topic.id, location.key, navigation, selection]);
  useEffect(() => () => { copyOperation.current++; }, []);
  useEffect(() => { if (!copied) return; const timeout = window.setTimeout(() => setCopied(false), 1800); return () => window.clearTimeout(timeout); }, [copied]);
  function chooseTopic(id: string, fromSearch = false) {
    const destination = DOC_TOPICS.find(item => item.id === id)!;
    const match = fromSearch ? searchDocSelection(destination, query) : undefined;
    setNavigationOpen(false); setQuery(''); navigated.current = true;
    navigate(docHref(id, match), { state: { preserveTabFocus: true } });
  }
  async function copyLink() {
    const token = ++copyOperation.current;
    setCopied(false); setCopyError('');
    try { await navigator.clipboard.writeText(new URL(docHref(topic.id, selection), window.location.origin).href); if (token === copyOperation.current) setCopied(true); }
    catch { if (token === copyOperation.current) setCopyError('Copy is unavailable. You can copy this page’s address from the browser.'); }
  }
  return <div className="api-docs">
    <div className="api-docs-toolbar"><div className="api-docs-search"><Icon name="search" size={18} /><input ref={searchInput} type="search" aria-label="Search API documentation" aria-controls="api-docs-navigation" placeholder="Search documentation, endpoints, fields…" value={query} maxLength={200} onChange={event => { setQuery(event.target.value); setNavigationOpen(true); }} onKeyDown={event => { if (event.key === 'Escape') { setQuery(''); setNavigationOpen(false); } if (event.key === 'Enter' && results.length) { event.preventDefault(); chooseTopic(results[0].id, true); } }} />{query && <button type="button" aria-label="Clear documentation search" onClick={() => { setQuery(''); searchInput.current?.focus(); }}><Icon name="close" size={16} /></button>}</div><a className="button button--secondary" href={API_DOCS_SOURCE} target="_blank" rel="noreferrer">Official reference<Icon name="external" size={16} /></a></div>
    <div className="api-docs-layout">
      <aside className={`api-docs-sidebar${navigationOpen ? ' is-open' : ''}`}><button className="api-docs-mobile-toggle" type="button" aria-expanded={navigationOpen} aria-controls="api-docs-navigation" onClick={() => setNavigationOpen(!navigationOpen)}><Icon name="list" size={18} /><span>{query ? `${results.length} results` : topic.title}</span><Icon name="chevron-down" size={17} /></button><nav id="api-docs-navigation" aria-label="API documentation">
        {query && <p className="api-docs-search-status" role="status">{results.length ? `${results.length} matching ${results.length === 1 ? 'section' : 'sections'}` : 'No matching sections. Try a field name, status code or endpoint.'}</p>}
        {groups.map(group => <div className="api-docs-nav-group" key={group}><p>{group}</p>{results.filter(item => item.group === group).map(item => <Link key={item.id} to={docHref(item.id, query ? searchDocSelection(item, query) : undefined)} state={{ preserveTabFocus: true }} aria-current={topic.id === item.id ? 'page' : undefined} onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); chooseTopic(item.id, Boolean(query.trim())); }}>{item.endpoint ? <span className={`api-docs-nav-method api-docs-nav-method--${item.endpoint.method.toLowerCase()}`}>{item.endpoint.method}</span> : <Icon name={item.id === 'getting-started' ? 'arrow' : item.id === 'authentication' ? 'key' : item.id === 'errors' ? 'alert' : item.id === 'filters' ? 'list' : 'chart'} size={15} />}<span>{item.title}</span></Link>)}</div>)}
        {!query && <p className="api-docs-source-note">API v1<br />Reference reviewed 24 Oct 2026</p>}
      </nav></aside>
      <article className="api-docs-article" id={topic.id} ref={article} tabIndex={-1} aria-labelledby="api-docs-title">
        <header className="api-docs-article-heading"><div><p className="api-docs-kicker">{topic.group}</p><h2 id="api-docs-title">{topic.title}</h2><p>{topic.summary}</p></div><Button variant="ghost" size="sm" className="api-docs-copy-link" onClick={() => void copyLink()} aria-label={copied ? 'Documentation link copied' : 'Copy link to this section'} title={copied ? 'Copied' : 'Copy section link'}><Icon name={copied ? 'check' : 'link'} size={18} /><span>{copied ? 'Copied' : 'Copy link'}</span></Button></header>
        {copyError && <p className="api-docs-copy-error" role="status">{copyError}</p>}
        <div key={topic.id} className="api-docs-article-body">{topic.endpoint ? <EndpointArticle endpoint={topic.endpoint} selection={selection} onViewChange={view => navigate(docHref(topic.id, { view }), { state: { preserveTabFocus: true } })} /> : topic.id === 'authentication' ? <Authentication /> : topic.id === 'filters' ? <Filters selection={selection} /> : topic.id === 'limits' ? <Limits /> : topic.id === 'errors' ? <Errors /> : <GettingStarted />}</div>
        <footer className="api-docs-footer">{DOC_TOPICS.findIndex(item => item.id === topic.id) > 0 && <button type="button" onClick={() => chooseTopic(DOC_TOPICS[DOC_TOPICS.findIndex(item => item.id === topic.id) - 1].id)}><Icon name="arrow-left" size={17} /><span>Previous<strong>{DOC_TOPICS[DOC_TOPICS.findIndex(item => item.id === topic.id) - 1].title}</strong></span></button>}{DOC_TOPICS.findIndex(item => item.id === topic.id) < DOC_TOPICS.length - 1 && <button type="button" className="api-docs-footer-next" onClick={() => chooseTopic(DOC_TOPICS[DOC_TOPICS.findIndex(item => item.id === topic.id) + 1].id)}><span>Next<strong>{DOC_TOPICS[DOC_TOPICS.findIndex(item => item.id === topic.id) + 1].title}</strong></span><Icon name="arrow" size={17} /></button>}</footer>
      </article>
    </div>
  </div>;
}
