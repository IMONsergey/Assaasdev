/** Website API, original documents dated 2026-10-22. Optional fields stay optional. */
export type PlanType = 'Guest' | 'Free' | 'Plus' | 'Expert' | 'Business';
export type BillingCadence = 'monthly' | 'annually';

export interface ResponseMetadata {
  subscription_type?: PlanType | string;
  auth_required?: boolean;
  full_access?: boolean;
  search_restrictions?: { blocked_fields?: string[]; blocked_values?: string[] };
  result_restrictions?: { hidden_fields?: string[]; hidden_labels?: string[] };
  credits?: number;
  timestamp?: number;
  guest_access?: { daily_limit: number; remaining_daily_searches: number };
}

export interface SearchFilter {
  operator?: 'AND' | 'OR' | 'NOT' | '';
  field?: string;
  value?: string;
  filters?: SearchFilter[];
}
export interface RangeFilter { field: string; start?: number | string; end?: number | string }
export interface SearchRequest {
  ip?: string;
  host?: string;
  cve_ID?: string;
  task_ids?: string[];
  simple_search_filters?: SearchFilter[];
  full_text_search?: string;
  security_body?: string;
  robots_body?: string;
  exposed_data?: string;
  sort_field?: string;
  sort_direction?: string;
  page?: number;
  docs_per_page?: number;
  min_size_mb?: number;
  max_size_mb?: number;
  range_filter?: RangeFilter[];
  st?: string;
  share_token?: string;
}

export interface HostCard {
  ip: string;
  os?: string;
  org?: string;
  city_name?: string;
  country_code?: string;
  region?: string;
  uts?: number;
  labels_list?: string[];
  open_ports?: { protocol?: string; port: number }[];
}
export interface DetectedProduct {
  product?: string; version?: string; vendor?: string;
  cve_product?: string; cve_vendor?: string; cve_identifier?: string;
  labels?: string[];
  cve_list?: { cve_id?: string; base_score?: number }[];
  exposed_data?: { field_headers?: string[]; field_value?: string[][] };
}
export interface PortRecord {
  port?: number; protocol?: string; transport?: string; uts?: number;
  banner?: string; status?: string; title?: string; status_code?: number;
  favicon_md5?: string; banner_sha256?: string; body_sha256?: string; body?: string; headers?: Record<string, string[]>;
  cert_domains?: string[]; redirects?: string[]; link?: string; header_domains?: string[];
  tls_info?: Record<string, unknown>;
  security_txt?: { is_security_txt?: boolean; body?: string; contacts?: string[]; url?: string; endpoint?: string };
  robots_txt?: { status_code?: number; body?: string };
  detected_products?: DetectedProduct[];
}
export interface HostDetail extends Partial<HostCard> {
  as_cidr?: string; type?: string; country_name?: string; continent_name?: string;
  region_code?: string; asn?: number; cts?: number; ports?: PortRecord[];
}
export type DnsData = { updated_at?: number; records?: Record<string, unknown>; [key: string]: unknown } | null;
export type WhoisData = Record<string, unknown> | null;
export type DomainMapData = Record<string, unknown> | Record<string, unknown>[] | null;
export interface FacetValue { key: string | number; doc_count: number }
export interface FacetData { facet_name: string; facet_values: FacetValue[] }
export interface CompleteData { complete: true }
export interface AnalyticsFacet { key: string; enabled: boolean; priority: number }
export interface AutocompleteData { type: 'fields' | 'values'; field: string; results: string[]; has_more: boolean }

export interface SavedQuery { id: string; query: string; created_at?: number; updated_at?: number }
export type SavedQueries = SavedQuery[];
export interface ShortLinkData { short_id: string; short_url: string }
export interface ShareLinkData extends ShortLinkData { long_url: string; share_token: string }
export interface ShareLinkRequest { data: SearchRequest; query: string; ttl_seconds?: number; max_opens?: number }

export interface BucketFilter {
  page?: number; docs_per_page?: number; host?: string;
  key_words?: string[]; stop_words?: string[]; extensions?: string[]; exclude_extensions?: boolean;
  min_size_mb?: number; max_size_mb?: number; alphabets?: string[];
  gte_uts?: number; lte_uts?: number; gte_cts?: number; lte_cts?: number;
  product_names?: string[]; sort_field?: 'cts' | 'uts' | 'size_mb'; sort_direction?: 'asc' | 'desc';
  /** Accepted by the documented server but NOT applied; do not offer as working filters. */
  country_code_include?: string[]; country_code_exclude?: string[]; excluded_buckets?: string[];
}
export interface BucketFile {
  host?: string; container?: string; protocol?: string; key?: string; extension?: string;
  alphabets?: string[]; alias_hosts?: string[]; cts?: number; uts?: number; size_mb?: number;
}
export interface BucketResults { result_count: number; result: BucketFile[] }
export interface BucketAnalytics { result_count: number; result: { host: string; container?: string; file_count: number }[] }

export interface PrivateTaskRequest {
  id?: string; host_list?: string[]; cidr_list?: string[]; port_list?: number[]; schedule?: string;
  /** Server ignores this on create and uses 500. Omit it from new requests. */
  workers?: number;
}
export interface PrivateTask {
  id: string; start_time?: number; end_time?: number; created_at?: number; status?: string;
  schedule?: string; done_task_count?: number; task_count?: number;
  port_list?: number[]; host_list?: string[]; cidr_list?: string[];
  result_count?: number; has_results?: boolean;
}
export interface PlanningTask extends PrivateTaskRequest { id: string; user_name?: string }

export interface Subscription {
  type: PlanType | string; start_date?: number; expiry_date?: number; last_payment?: string;
  credits?: number; scan_credits?: number; search_pages?: number; api_access?: boolean;
  price?: number; payment_required?: boolean;
  /** Nanoseconds in the account subscription; not milliseconds. */
  duration?: number; canceled?: boolean; canceled_at?: number; expiry_warning_notified_at?: number;
  recurring_promo?: Record<string, unknown>;
}
export interface Team {
  team_owner_id?: string; team_owner_name?: string; team_owner_email?: string;
  is_team_member?: boolean;
  team_members?: { user_id: string; email?: string; user_name?: string; added_at?: number }[];
}
export interface DepositAddress { network: string; coin: string; address: string }
/** Integer token units and readable totals are strings; never coerce them to Number. */
export interface TrackedAddress extends DepositAddress {
  is_active: boolean; last_checked_at?: number; last_tx_timestamp?: number;
  total_received: string; total_received_readable: string;
}
export interface AddressTransaction {
  tx_hash: string; from_address: string; amount: string; decimals: number;
  block_number: string; timestamp: number; status: 'received' | 'processed' | 'failed';
  created_at: number; processed_at?: number;
}
export interface UserAddressesData { user_id?: string; addresses: TrackedAddress[]; timestamp?: number }
export interface AddressTransactionsData { address: string; transactions: AddressTransaction[]; count: number; timestamp?: number }
/** Account-only fields are optional because /whoami may return the guest shape. */
export interface Profile {
  session_id?: string; authenticated_at?: number; issued_at?: number; expires_at?: number;
  user_id?: string; user_name?: string; email?: string; user_type?: string;
  balance?: number; credits?: number; scan_credits?: number; purchased_credits?: number;
  addresses?: DepositAddress[]; subscription?: Subscription; api_key?: string; totp_active?: boolean;
  is_paddle_client?: boolean; telegram_account?: Record<string, unknown>; team?: Team;
  analytics_facets?: AnalyticsFacet[]; daily_search_limit?: number; remaining_daily_searches?: number;
  /** Compatibility hint only; the documented guest discriminator is user_type=GUEST. */
  guest?: boolean;
}
export interface SessionRecord {
  session_id: string; ip_address?: string; user_agent?: string; device_info?: string;
  location?: string; browser?: string; os?: string; last_activity?: number;
  is_active?: boolean; is_current?: boolean; created_at?: number; authenticated_at?: number;
}
export interface SessionData { sessions: SessionRecord[]; total: number; limit: number }
export interface SessionLimits { max_sessions: number; current_sessions: number; can_create_new: boolean; subscription: string }
export interface TOTPEnrollmentData {
  qr_code_url: string; secret_key: string; account_name?: string; issuer?: string; message?: string; warning?: string;
}
export interface TOTPValidationData { is_valid: boolean; message?: string; backup_codes?: string[] }

export interface PricingPlan {
  type: string; name?: string; description?: string; monthly_price: number; annually_price: number;
  credits?: number; scan_credits?: number; search_pages?: number; users?: number; duration?: string;
  search_filters?: string; advanced_search?: boolean; api_access?: boolean; api_rate_limit?: number;
  cve?: boolean; buckets?: boolean; leak_data?: boolean; bulk_data?: boolean; private_scanning?: boolean; support?: string;
}
export interface TokenPack { id: string; name?: string; product_name?: string; tokens: number; price_usd: number; discount_percent?: number; price_per_token?: number; description?: string }
export interface PricingData { subscriptions: PricingPlan[]; tokens: TokenPack[]; timestamp?: number }
export interface PurchaseRequest { subscription?: string; token_pack_id?: string; cadence?: BillingCadence; promo_code?: string }
export interface CheckoutRequest extends PurchaseRequest { currency?: string; apply_discount?: boolean; return_url?: string; cancel_url?: string }
export interface CheckoutData { checkout_url: string; transaction_id: string; status: string; message?: string; product_type?: string }
export interface PromoData { valid: boolean; promo_code?: string; promo_code_id?: string; description?: string; discount_value?: number; discount_pct?: number; original_amount_usd?: number; final_amount_usd?: number; timestamp?: number }
export interface NetworkData { network: string; coins: { coin: string; name?: string; price?: number; addresses?: string[] }[] }
export interface CryptoInvoice {
  payment_id: string; network?: string; coin?: string; address?: string; amount?: number;
  amount_usd?: number; original_amount_usd?: number; final_amount_usd?: number; description?: string;
  crypto_fee?: number; promo_code?: string; promo_code_id?: string; discount_value?: number; discount_pct?: number;
  promo_status?: string; expires_at?: number; timestamp?: number; message?: string;
}
/** The document does not define a complete status enum; preserve unknown values. */
export interface PaymentConfirmation { payment_id: string; status: string; subscription_type?: string; expiry_date?: number; message?: string; timestamp?: number }
export interface BillingPayment {
  payment_id: string; address?: string; subscription?: string; amount?: number; amount_usd?: number;
  status?: string; network?: string; coin?: string; created_at?: number; updated_at?: number; completed_at?: number; expires_at?: number;
}
export interface BillingData {
  user_id?: string; addresses?: DepositAddress[]; payments?: BillingPayment[];
  subscription?: Subscription & { name?: string; days_remaining?: number; active?: boolean };
  balance?: number; credits?: number; scan_credits?: number; timestamp?: number;
}
export interface NotificationRecord { id: string; user_id?: string; notification_type: string; message?: string; payload?: Record<string, unknown>; is_read: boolean; created_at: number }
export interface NotificationsData { notifications: NotificationRecord[]; total: number; unread_count: number; timestamp?: number }

export interface BulkDownloadRequest extends SearchRequest {
  format?: 'json' | 'csv'; download_mode: 'partial' | 'full'; max_documents?: number;
}
export interface BucketDownloadRequest extends BucketFilter {
  format?: 'json' | 'csv'; download_mode?: 'files' | 'hosts'; max_documents?: number;
}
