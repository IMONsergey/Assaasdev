/** Dispatch catalog from the website API originals dated 2026-10-22. */
export type CompletionRule = 'single' | 'facets' | 'host-sections' | 'private-host-sections' | 'ack-followup' | 'payment';
export interface MethodDefinition {
  type: string;
  mutation: boolean;
  responseTypes: readonly string[];
  completion: CompletionRule;
  payloadKeys: readonly string[];
  access: string;
  /** Descriptive only: backend configuration and returned metadata are authoritative. */
  cost: string;
  notes?: string;
}

const searchKeys = ['ip', 'host', 'cve_ID', 'task_ids', 'simple_search_filters', 'full_text_search', 'security_body', 'robots_body', 'exposed_data', 'sort_field', 'sort_direction', 'page', 'docs_per_page', 'min_size_mb', 'max_size_mb', 'range_filter', 'st', 'share_token'];
const bucketKeys = ['page', 'docs_per_page', 'host', 'key_words', 'stop_words', 'extensions', 'exclude_extensions', 'min_size_mb', 'max_size_mb', 'alphabets', 'gte_uts', 'lte_uts', 'gte_cts', 'lte_cts', 'product_names', 'sort_field', 'sort_direction', 'country_code_include', 'country_code_exclude', 'excluded_buckets'];
const purchaseKeys = ['subscription', 'token_pack_id', 'cadence', 'promo_code'];
const taskKeys = ['id', 'schedule', 'host_list', 'cidr_list', 'port_list', 'workers'];
const method = (type: string, input: Partial<Omit<MethodDefinition, 'type'>> = {}): MethodDefinition => ({
  type, mutation: false, responseTypes: [type], completion: 'single', payloadKeys: [],
  access: 'account; no paid-plan gate', cost: '0', ...input,
});

/** The 52 dispatched request types. Push/section names are not separate request methods. */
export const methodCatalog: Readonly<Record<string, MethodDefinition>> = Object.freeze(Object.fromEntries([
  method('hosts', { access: 'Free+; guest/share rules', cost: '1 search credit', payloadKeys: searchKeys }),
  method('analytics', { access: 'Free+; guest/share rules', cost: 'ceil(loaded facet count / 4)', payloadKeys: searchKeys, completion: 'facets' }),
  method('analytics_settings', { mutation: true, access: 'account or guest', payloadKeys: ['facets'] }),
  method('analytics_settings_delete', { mutation: true, access: 'account or guest' }),
  method('hostinfo', { access: 'Free+; guest/share rules', cost: 'default 1', payloadKeys: searchKeys, responseTypes: ['hostinfo', 'dnsinfo', 'whois', 'domain_ip_map'], completion: 'host-sections' }),
  method('cveinfo', { access: 'Free+', payloadKeys: ['cve_ID'] }),
  method('autocomplete', { access: 'Free+', payloadKeys: ['query', 'field'], notes: 'query is nonempty; * is allowed. context does not change dispatch.' }),
  method('buckets', { access: 'Plus+', cost: '1', payloadKeys: bucketKeys, notes: 'country_code_include, country_code_exclude and excluded_buckets are ignored by server.' }),
  method('bucket_analytics', { access: 'Plus+', cost: '1', payloadKeys: bucketKeys }),
  method('private_hosts', { access: 'Business/full-access or matching share', cost: 'default 1', payloadKeys: searchKeys }),
  method('private_analytics', { access: 'Business/full-access or matching share', cost: 'default 1', payloadKeys: searchKeys, completion: 'facets' }),
  method('private_hostinfo', { access: 'Business/full-access or matching share', cost: 'default 1', payloadKeys: searchKeys, completion: 'private-host-sections', responseTypes: ['private_hostinfo', 'dnsinfo', 'whois'], notes: 'Success frames omit id and metadata. Isolated socket per invocation; no domain map.' }),
  method('private_task_add', { mutation: true, access: 'Business/full-access', cost: '(host count + CIDR address count) * port count scan credits', payloadKeys: taskKeys, completion: 'ack-followup', responseTypes: ['private_task_add', 'private_tasks_get'] }),
  method('private_task_update', { mutation: true, access: 'Business/full-access', payloadKeys: taskKeys }),
  method('private_task_remove', { mutation: true, access: 'Business/full-access', payloadKeys: ['id'], completion: 'ack-followup', responseTypes: ['private_task_remove', 'private_tasks_get'] }),
  method('private_planning_task_remove', { mutation: true, access: 'Business/full-access', payloadKeys: ['id'], completion: 'ack-followup', responseTypes: ['private_planning_task_remove', 'private_planning_tasks_get'] }),
  method('private_tasks_get', { access: 'Business/full-access' }),
  method('private_planning_tasks_get', { access: 'Business/full-access' }),
  method('private_task_results_delete', { mutation: true, access: 'Business/full-access', payloadKeys: ['task_ids'] }),
  method('get_pricing_info'),
  method('networks'),
  method('validate_promo_code', { payloadKeys: purchaseKeys }),
  method('init_checkout', { mutation: true, payloadKeys: [...purchaseKeys, 'currency', 'apply_discount', 'return_url', 'cancel_url'] }),
  method('billing_manage'),
  method('get_address', { mutation: true, payloadKeys: [...purchaseKeys, 'network', 'coin'], notes: 'Creates an invoice, valid 60 minutes; do not retry an unknown outcome.' }),
  method('pay_with_balance', { mutation: true, payloadKeys: purchaseKeys }),
  method('confirm_payment', { payloadKeys: ['payment_id'], completion: 'payment', notes: 'Multiple frames. Completed is documented; no exhaustive status enum or final marker.' }),
  method('delete_payment', { mutation: true, payloadKeys: ['payment_id'], notes: 'Moves payment to deleted history; not a refund.' }),
  method('user_billing'),
  method('get_user_addresses_info'),
  method('get_address_transactions', { payloadKeys: ['address'] }),
  method('cancel_subscription', { mutation: true }),
  method('resume_subscription', { mutation: true }),
  method('get_notifications', { access: 'Free+', payloadKeys: ['limit', 'offset'], notes: 'Default limit20, max100; offset defaults to0.' }),
  method('mark_notification_read', { mutation: true, payloadKeys: ['id'] }),
  method('mark_all_notifications_read', { mutation: true }),
  method('unread_notifications', { access: 'Free+', notes: 'Handler failures may be logged without a response; use timeout/refresh state.' }),
  method('query_create', { mutation: true, access: 'Plus+', payloadKeys: searchKeys, notes: 'Stores the data object as a JSON string. Maximum 20 saved queries.' }),
  method('query_list', { access: 'Plus+' }),
  method('query_delete', { mutation: true, access: 'Plus+', payloadKeys: ['id'], notes: 'data.id is 24 hex characters from query_list, separate from envelope id.' }),
  method('short_link_create', { mutation: true, payloadKeys: ['query'] }),
  method('share_link_create', { mutation: true, payloadKeys: ['data', 'query', 'ttl_seconds', 'max_opens'], notes: 'Default 7 days/10 opens. Exact search payload binding, creator identity.' }),
  method('regenerate_api_key', { mutation: true, access: 'Plus+', notes: 'Previous key stops working immediately.' }),
  method('org_add', { mutation: true, access: 'Business owner', payloadKeys: ['user_id'] }),
  method('org_remove', { mutation: true, access: 'Business owner', payloadKeys: ['user_id'] }),
  method('org_leave', { mutation: true, access: 'all account plans; owner cannot leave' }),
  method('user_sessions', { access: 'Free+' }),
  method('session_limits', { access: 'Free+' }),
  method('terminate_user_session', { mutation: true, access: 'Free+', payloadKeys: ['session_id'], completion: 'ack-followup', responseTypes: ['terminate_user_session', 'user_sessions'] }),
  method('terminate_all_sessions', { mutation: true, access: 'Free+', completion: 'ack-followup', responseTypes: ['terminate_all_sessions', 'user_sessions'], notes: 'Keeps current session. HTTP GET /auth/logout deletes ALL sessions.' }),
  method('totp', { mutation: true, notes: 'Enrollment secret lives 15 minutes.' }),
  method('totp_validate', { mutation: true, payloadKeys: ['totp_code'], notes: 'Enrollment confirmation; issues 5 one-time 8-character backup codes. Login uses HTTP /auth/totp/verify.' }),
].map((definition) => [definition.type, definition])));

/** Explicitly declared but not dispatched in the Russian API original. */
export const unsupportedMethods = Object.freeze([
  'fields', 'networkHistory', 'networks_history_aggregation', 'buy_credits', 'credits_status',
  'get_token_pack_prices', 'get_subscription_pricing', 'get_token_pricing',
] as const);

export function getMethodDefinition(type: string): MethodDefinition | undefined { return methodCatalog[type]; }
