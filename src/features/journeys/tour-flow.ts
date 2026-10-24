import type { Scenario, ScenarioTarget } from './catalog';

/** A walkthrough observes the real workspace. It never owns a copy of product data. */
export type TourSignal =
  | { kind: 'visible'; selector: string }
  | { kind: 'hidden'; selector: string }
  | { kind: 'route'; pattern: string; session?: 'authenticated' | 'authenticated-or-verifying' }
  | { kind: 'event'; event: 'click' | 'input' | 'change' | 'submit'; selector: string; thenVisible?: string; thenHidden?: string };
export interface TourStep {
  anchor: string;
  wait?: TourSignal;
  hint?: string;
  open?: { selector: string; label: string; until?: string };
  target?: ScenarioTarget | null;
  nextLabel?: string;
  missing?: string;
}
/** An observed click alone cannot certify a save while its form is still open. */
export function observedEventComplete(signal: Extract<TourSignal, {kind:'event'}>, observed: boolean, isVisible: (selector:string)=>boolean) {
  return observed && (!signal.thenVisible || isVisible(signal.thenVisible)) && (!signal.thenHidden || !isVisible(signal.thenHidden));
}
const read = (anchor: string, nextLabel?: string): TourStep => ({ anchor, nextLabel });
const visible = (anchor: string, selector: string, hint: string): TourStep => ({ anchor, wait: { kind: 'visible', selector }, hint });
const event = (anchor: string, kind: 'click' | 'input' | 'change' | 'submit', selector: string, hint: string, thenVisible?: string): TourStep => ({ anchor, wait: { kind: 'event', event: kind, selector, thenVisible }, hint });
const route = (anchor: string, pattern: string, hint: string): TourStep => ({ anchor, wait: { kind: 'route', pattern }, hint });
const query = '#main-search-query';
const results = '[data-onboarding="search-results"][data-ready="true"] .search-result-row';
const runSearch = () => visible('.search-filter-dialog button[type="submit"], ' + query + ', .search-composer', results, 'Run Search. The next step opens when results arrive.');
const chooseHost = () => route('.search-filter-dialog button[type="submit"], .search-result-row, ' + query, '^/(?:private/)?hosts/', 'Open a host from your results to continue.');
const filters = '#search-conditions-form';
const applyFilters = () => event(filters + ', #search-filter-toggle', 'submit', filters, 'Apply your conditions to continue.', results);
const catalog = '.host-service-picker';
const service = '.host-service-detail';
const fileQuery = '#files-main-query';
const fileResults = '[data-onboarding="file-results"][data-ready="true"] .files-table tbody tr';
const runFiles = () => visible(fileQuery, fileResults, 'Run your file search to continue.');
const profile = '#settings-panel-profile .account-identity, #settings-panel-profile';
const security = '#settings-panel-security';
const sessionList = '#settings-panel-sessions';
const plans = '.billing-plans';
const purchase = '.billing-purchase-summary';
const pack = '.billing-token-packs';
const signIn = ():TourStep => ({...route('.auth-form','^/(?!auth(?:/|$))','Complete sign-in in the highlighted form.'),wait:{kind:'route',pattern:'^/(?!auth(?:/|$))',session:'authenticated'}});
const exportOpen: TourStep = { anchor:'[data-onboarding="export-search"], .search-result-actions', wait:{kind:'visible',selector:'[data-onboarding="export-dialog"]'}, hint:'Open Export to review the available options.', open:{selector:'[data-onboarding="export-search"]',label:'Open export'} };
const exportRun = (recover=false):TourStep => visible('[data-onboarding="export-dialog"]',recover?'[data-export-status="complete"], [data-export-status="interrupted"]':'[data-export-status="complete"]',recover?'Use the export controls and review the returned transfer status.':'Start the export when the scope is correct. Wait for the reported save result.');
const exportReview = read('[data-onboarding="export-dialog"]');

/** Every catalog step has an explicit live target; conditional actions remain user controlled. */
export const tourFlows: Record<string, TourStep[]> = {
  'first-search': [runSearch(), chooseHost(), read('.host-overview', 'Finish walkthrough')],
  'exact-domain': [read(filters, 'Review conditions'), applyFilters(), event('.search-composer','submit','.search-query-bar, #search-conditions-form','Change the conditions and run the comparison search.',results)],
  'network-search': [read(query, 'Open filters'), read(filters, 'Review search'), {...chooseHost(),target:null}, read('.host-overview')],
  'refine-search': [runSearch(), {anchor:filters,wait:{kind:'hidden',selector:filters},hint:'Apply or cancel the filter draft to continue.'}, read('.search-result-toolbar, .search-composer')],
  'combine-conditions': [read('.search-condition-section', 'Review groups'), read('.search-condition-list, ' + filters, 'Use the search controls'), {...chooseHost(),target:null}, read(catalog)],
  'exclude-conditions': [read('.search-condition-section', 'Review exclusion'), {...chooseHost(),target:null}, read('.host-overview')],
  'browse-large-results': [runSearch(), event('.search-result-controls', 'change', '.search-result-controls select', 'Choose a sort order or page size.'), chooseHost(), {anchor:'.host-back',wait:{kind:'route',pattern:'^/(?:private/)?search(?:\\?|$)'},hint:'Use Back to results to restore your result page.'}],
  'explore-analytics': [runSearch(), visible('.search-analytics-panel', '.search-facet-grid:not([aria-busy="true"]) .search-facet-item', 'Choose Load analytics and wait for the distributions.'), event('.search-analytics-panel','click','.search-facet-item button','Select a distribution value to build a filter.','.search-query-draft'), event('.search-query-draft','click','.search-query-draft .button--primary','Apply the changed query and wait for the results.',results)],
  'share-search': [runSearch(), {anchor:'[data-onboarding="share-search"]',wait:{kind:'visible',selector:'.search-share-grid'},hint:'Open Share to choose the link type.',open:{selector:'[data-onboarding="share-search"]',label:'Open sharing'}},visible('.search-share-grid','.search-created-link input','Review the options, then explicitly create your chosen link.'),read('.search-created-link')],
  'restore-search-context': [runSearch(), event('.search-composer','submit','.search-query-bar','Run a different query to continue.',results), read('.search-result-toolbar', 'Open analytics'), read('.search-analytics-panel')],
  'classify-services': [chooseHost(), read(catalog, 'Filter services'), event('.host-service-classify > summary, .host-service-sort','change','.host-service-filters select, .host-service-sort select','Open service filters, then change a protocol or sort order.'), read(service + ', ' + catalog)],
  'understand-coverage': [chooseHost(), read('.host-metrics', 'Open DNS & domains'), read('.host-dns-layout, .host-tab-panel:not([hidden])', 'Open full overview'), read('.host-overview, .host-page')],
  'compare-observations': [chooseHost(), read(catalog, 'Compare an observation'), event('.host-service-rows','click','.host-service-rows button','Select another service observation.'), read('.host-response-content, ' + service)],
  'keep-service-selection': [chooseHost(), read(catalog, 'Change filters'), event('.host-service-filters','input','.host-service-filters input, .host-compact-search input','Change a service filter to continue.'), read(catalog)],
  'inspect-http-tls': [chooseHost(), read('.host-response-content, ' + service,'Explore code controls'), read('.code-canvas, .host-response-content','Open TLS'), read('.host-service-panel, ' + service)],
  'read-observation-states': [chooseHost(), read('.host-service-panel, ' + service,'Review value states'), read('.host-service-panel, ' + service,'Open host overview'), read('.host-overview')],
  'dns-whois': [chooseHost(), read('.host-dns-layout, .host-tab-panel:not([hidden])','Open WHOIS'), read('.host-tab-panel:not([hidden])','Return to services'), read(catalog)],
  'review-products-cve': [chooseHost(), read(catalog,'Open products & CVE'), read('.host-service-panel, ' + service,'Inspect references'), read('.host-products, .host-service-panel, ' + service)],
  'find-files': [read(fileQuery,'Review file filters'), {anchor:'.files-filter-surface, #files-filter-toggle',open:{selector:'#files-filter-toggle',label:'Open filters',until:'.files-filter-surface'},nextLabel:'Use the search controls'}, visible('.files-filter-surface, .files-table, ' + fileQuery,'.files-detail-facts','Run the search and open a file to continue.')],
  'bucket-drilldown': [{...runFiles(),target:{path:'/files?view=hosts'}}, event('.files-table--buckets','click','.files-table--buckets tbody tr','Open a returned bucket to continue.','[data-onboarding="file-results"][data-ready="true"] .files-table:not(.files-table--buckets) tbody tr'), read('.files-table, .files-scope-toolbar')],
  'export-results': [runSearch(), exportOpen, exportRun(), exportReview],
  'recover-export': [runSearch(), exportOpen, exportRun(true)],
  'create-scan': [read('.scanner-form-fields textarea','Choose ports'), read('.scanner-form-section:nth-child(2)','Review task'), visible('.scanner-form-actions','.scanner-review','Select Review task and resolve any validation issues.'), {...route('.scanner-review','^/scanner\\?.*created=','Confirm only when the review is correct. Continue after the task is accepted.'),target:null}],
  'monitor-scan': [visible('.scanner-task-table','.scanner-task-details','Open a task to inspect it.'), read('.scanner-task-details','Open scheduled tasks'), read('.scanner-tasks-table-wrap')],
  'private-results': [route('.scanner-view-results','^/private/search','Open View results for the intended task.'), chooseHost(), read('.host-overview','Review export scope'), { ...exportOpen, target:{area:'search',params:{view:'results'}} }],
  'manage-scan-data': [visible('.scanner-task-table','.scanner-task-details','Open the task you want to inspect.'), read('.scanner-task-details, .scanner-row-actions','Review management options'), read('dialog[open] .dialog-body, .scanner-task-table','Open scheduled tasks'), read('.scanner-tasks-table-wrap')],
  'account-access': [{...route('.auth-form','^/auth/(?:totp|verify)|^/(?!auth(?:/|$))','Sign in to continue.'),wait:{kind:'route',pattern:'^/auth/(?:totp|verify)|^/(?!auth(?:/|$))',session:'authenticated-or-verifying'}}, signIn(), read(profile)],
  'connected-sign-in': [{...signIn(),anchor:'.auth-social',missing:'Connected sign-in is unavailable here. Use the sign-in form or skip this method.'}, signIn(), read(profile)],
  'secure-account': [read(security,'Review recovery access'), read('.account-backup, .account-totp-setup, ' + security,'Open sessions'), read(sessionList,'Open sign-out controls'), read(profile)],
  'update-profile': [read('[data-onboarding="profile-form"], ' + profile,'Review your update'), visible('[data-onboarding="profile-form"], [data-onboarding="profile-verification"]','.profile-workspace[data-onboarding-state="success"]','Save the intended changes and complete verification when requested.'), read('#settings-panel-profile','Open password settings'), read(security)],
  'manage-team': [read('#settings-panel-team .account-team-table, #settings-panel-team','Review member controls'), read('.account-member-form, #settings-panel-team','Review membership actions'), read('.account-team-table, #settings-panel-team','Review current membership'), read('#settings-panel-team')],
  'choose-plan': [read('.billing-cadence, ' + plans,'Choose a plan'), visible(plans,purchase,'Select a plan to open its order review.'), read(purchase,'Review payment methods'), read('dialog[open] .form-grid, ' + purchase)],
  'review-credits': [read('.billing-metrics','Open usage & limits'), read('.api-usage-grid','Open credit packs'), read(pack)],
  'check-payment': [read('.billing-history, [data-onboarding="check-payment"]','Inspect payment status'), {anchor:'[data-onboarding="payment-status"], [data-onboarding="check-payment"]',open:{selector:'[data-onboarding="check-payment"]',label:'Open payment check',until:'[data-onboarding="payment-status"]'},wait:{kind:'visible',selector:'.billing-payment-status, [data-onboarding="payment-status"][data-payment-status="unknown"], [data-onboarding="payment-status"][data-payment-status="error"]'},hint:'Enter the existing payment ID and check its reported status.'}, read('[data-onboarding="payment-status"]')],
  'billing-history': [read('.billing-history','Open billing overview'), read('.billing-current','Review subscription'), read('.billing-subscription-actions, .billing-current','Open crypto activity'), read('.billing-panel:not([hidden])')],
  'api-key': [read('.api-key-card','Review copy controls'), read('.api-key-card .cluster','Review key rotation'), read('.account-danger-zone','Open usage & limits'), read('.api-usage-grid')],
  'workspace-accessibility': [read('[data-onboarding="theme-options"], .theme-options','Try keyboard navigation'), read('[data-onboarding="settings-sections"], [data-onboarding="settings-navigation"], .settings-navigation','Open notifications'), read('.notification-groups, .notifications-page','Browse walkthroughs'), read('.scenario-grid')],
  'connection-recovery': [read('.settings-connection-actions','Open profile'), read(profile,'Review unfinished operations'), read('#settings-panel-profile','Open saved queries'), read('.search-saved-list, .search-saved-page')],
  'contact-support': [{anchor:'.support-home, [data-onboarding="support"]',open:{selector:'[data-onboarding="support"]',label:'Open support',until:'.support-home'},wait:{kind:'visible',selector:'.support-request-form'},hint:'Choose Contact support to open the request form.'},visible('.support-request-form','.support-review','Prepare the email to review your message.'),read('.support-message-preview','Review sending options'),read('.support-dialog .dialog-footer')],
  'legal-documents': [read('.legal-grid, #settings-panel-legal','Choose a document'),event('#settings-panel-legal','click','#settings-panel-legal a[target="_blank"]','Open an official document in a new tab.'),read('#settings-panel-legal')],
  'save-and-reopen-query': [runSearch(),{anchor:'.search-saved-toolbar, [data-onboarding="save-query"]',open:{selector:'[data-onboarding="save-query"]',label:'Open save options',until:'.search-saved-toolbar'},nextLabel:'Open saved queries'},read('.search-saved-list, .search-saved-page','Choose saved query'),route('.search-saved-list, .search-saved-page','^/(?:private/)?search\\?','Open the saved query to request its current results.')],
  'review-notifications': [read('.notification-summary, .notifications-page','Find an update'),read('.notification-groups, .notifications-page','Open a related destination'),route('.notification-open, .notification-destination','^/(?:billing|settings)','Follow a notification destination when one is available.'),read('.notification-actions, .notifications-page')],
  'export-file-records': [runFiles(),read('.files-table','Review download options'),{...exportOpen,anchor:'[data-onboarding="export-files"]',open:{selector:'[data-onboarding="export-files"]',label:'Open export'}},exportRun()],
  'buy-credit-pack': [read(pack,'Choose a credit pack'),visible(pack,purchase,'Choose Buy credits to review the selected pack.'),read(purchase,'Review current balance'),read('.billing-metrics')],
  'register-account': [route('.auth-form','^/auth/verify','Submit valid account details to open email verification.'),route('.auth-form','^/auth/login','Complete email verification before signing in.'),signIn(),read(profile)],
  'recover-password': [route('.auth-form','^/auth/recovery/confirm','Request the recovery code to continue.'),visible('.auth-form','.auth-form-wrap .alert--success','Complete recovery with your code and new password.'),signIn(),read(sessionList)],
  'search-history': [runSearch(), route('[data-onboarding="history-restore"]','^/(?:private/)?search\\?(?:[^#]*&)?draft=1(?:&|$)','Choose Restore to open a previous query as a draft.'), event('.search-results-list .empty-state .button, .search-query-bar button[type="submit"]','click','.search-query-bar button[type="submit"], .search-results-list .empty-state .button','Check the restored conditions, then select Run search.',results),read('[data-onboarding="search-results"], .search-result-toolbar','Finish walkthrough')],
  'manage-search-history': [runSearch(), {anchor:'[data-onboarding="history-clear"], [data-onboarding="search-history"]',open:{selector:'[data-onboarding="history-clear"]',label:'Review clearing history',until:'.search-history-clear-dialog[open]'},wait:{kind:'visible',selector:'.search-history-clear-dialog[open]'},hint:'Open Clear history to review the confirmation.'},event('[data-onboarding="history-confirm-clear"]','click','[data-onboarding="history-confirm-clear"]','Confirm Clear history only when you are ready.','[data-onboarding="search-history"][data-onboarding-state="cleared"]'),event('[data-onboarding="history-undo"]','click','[data-onboarding="history-undo"]','Choose Undo to restore the removed entries.','[data-onboarding="search-history"][data-onboarding-state="restored"]')],
  'upload-avatar': [{anchor:'[data-onboarding="avatar-picker"]',open:{selector:'[data-onboarding="avatar-picker"]',label:'Open avatar picker',until:'.avatar-dialog[open]'},wait:{kind:'visible',selector:'.avatar-dialog[open]'}},visible('.avatar-upload-control','[data-onboarding="avatar-preview"][data-onboarding-state="ready"] img[src^="data:image/"]','Choose an image using Upload photo, then wait for its preview.'),{anchor:'[data-onboarding="avatar-preview"], [data-onboarding="avatar-save"]',wait:{kind:'event',event:'click',selector:'[data-onboarding="avatar-save"]',thenHidden:'.avatar-dialog[open]',thenVisible:'.profile-avatar-button img[src^="data:image/"]'},hint:'Review your photo and select Use avatar.'},read('.profile-avatar-button, ' + profile,'Finish walkthrough')],
  'wallet-payment': [read('[data-onboarding="checkout-review"]','Check wallet balance'),visible('[data-onboarding="wallet-pay"], [data-onboarding="wallet-checkout"]','[data-onboarding="wallet-receipt"]','Select Pay with balance when ready. Continue when the payment is confirmed.'),event('[data-onboarding="wallet-receipt"]','click','[data-onboarding="wallet-done"]','Check the receipt, then select View payments.','.billing-history-table'),read('.billing-history-table, .billing-history','Finish walkthrough')],
  'pivot-from-host': [chooseHost(),route('[data-onboarding="host-field-search"], .host-response-content','^/(?:private/)?search\\?(?:[^#]*&)?draft=1(?:&|$)','Choose a search icon beside a response fact or header.'),event('.search-results-list .empty-state .button, .search-query-bar button[type="submit"]','click','.search-query-bar button[type="submit"], .search-results-list .empty-state .button','Review the field and value, then select Run search.',results),read('[data-onboarding="search-results"], .search-result-toolbar','Finish walkthrough')],
};

export function tourStepFor(scenario: Scenario, index: number): TourStep {
  return tourFlows[scenario.id][index];
}

/** Prefer the first visible selector, without reading input values or account content. */
export function findTourTarget(selector: string, root: ParentNode = document): HTMLElement | null {
  for (const part of selector.split(',').map(value => value.trim()).filter(Boolean)) {
    for (const element of root.querySelectorAll<HTMLElement>(part)) {
      if (element.closest('.scenario-tour-layer') || element.closest('[hidden]') || element.closest('[inert]')) continue;
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden') return element;
    }
  }
  return null;
}
