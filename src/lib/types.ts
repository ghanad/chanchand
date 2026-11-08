export interface PriceObservation {
  title?: string | null;
  seller?: string | null;
  price_irr?: number | null;
  availability: 'in_stock' | 'out_of_stock' | 'unknown';
  raw_observation: Record<string, any>;
}

export interface SourceConfig {
  adapter: string;
  timeout_seconds: number;
  rate_limit_seconds: number;
  currency: string;
  price_multiplier: number;
  headers: Record<string, string>;
  settings: Record<string, any>;
}

export interface ProductConfig {
  title: string;
}

export interface TargetConfig {
  product_key: string;
  product_title?: string;
  source_key: string;
  url: string;
  enabled: boolean;
  adapter_settings?: Record<string, any>;
}

export interface AppConfig {
  sources: Record<string, SourceConfig>;
  products?: Record<string, ProductConfig>;
  targets?: TargetConfig[];
}

export interface ManagedProductRow {
  key: string;
  title: string;
  user_id?: number | null;
  is_public?: number;
  show_usd_chart?: number;
  active_start_hour?: number | null;
  active_end_hour?: number | null;
  owner_username?: string | null;
  is_tracked_by_user?: boolean;
  last_manual_refresh_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProductRow {
  id: number;
  user_id: number;
  product_key: string;
  custom_title: string | null;
  last_manual_refresh_at?: string | null;
  created_at: string;
}

export interface ManagedTargetRow {
  id: number;
  product_key: string;
  source_key: string;
  url: string;
  enabled: number;
  adapter_settings: string;
  created_at: string;
  updated_at: string;
}

export interface ManagedSourceRow {
  key: string;
  adapter: string;
  timeout_seconds: number;
  rate_limit_seconds: number;
  currency: string;
  price_multiplier: number;
  headers: string;
  settings: string;
  created_at: string;
  updated_at: string;
}

export interface RunRow {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  config_path: string | null;
  target_count: number;
  success_count: number;
  error_count: number;
  trigger_source?: string | null;
  trigger_details?: string | null;
}

export interface PriceSnapshotRow {
  id: number;
  run_id: number;
  product_key: string;
  source_key: string;
  url: string;
  title: string | null;
  seller: string | null;
  price_irr: number | null;
  availability: string;
  observed_at: string;
  raw_observation: string;
  previous_price_irr?: number | null;
}

export interface FetchErrorRow {
  id: number;
  run_id: number;
  product_key: string;
  source_key: string;
  url: string;
  error_type: string;
  message: string;
  observed_at: string;
  raw_observation: string;
}

export type UserRole = 'admin' | 'viewer';

export interface UserRow {
  id: number;
  username: string;
  email: string | null;
  mobile?: string | null;
  password_hash: string;
  role: UserRole;
  must_change_password: number;
  wallet_balance: number;
  extra_slots: number;
  slot_expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafeUser {
  id: number;
  username: string;
  email: string | null;
  mobile?: string | null;
  role: UserRole;
  must_change_password: boolean;
  wallet_balance: number;
  extra_slots: number;
  slot_expires_at?: string | null;
  used_slots?: number;
  total_slots?: number;
  created_at: string;
  updated_at: string;
}

export interface WalletTransactionRow {
  id: number;
  user_id: number;
  amount: number;
  balance_after: number;
  type: 'admin_charge' | 'admin_adjustment' | 'slot_purchase';
  description: string | null;
  created_at: string;
}

export interface UserQuota {
  freeLimit: number;
  extraSlots: number;
  totalLimit: number;
  usedCount: number;
  remaining: number;
  canAdd: boolean;
  slotExpiresAt?: string | null;
  daysRemaining?: number | null;
  isExpired?: boolean;
}

export interface PackageRow {
  id: number;
  key: string;
  title: string;
  slots: number;
  price_toman: number;
  duration_days?: number;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface UserSubscriptionRow {
  id: number;
  user_id: number;
  slots: number;
  price_toman: number;
  duration_days: number;
  source_type: 'package' | 'wallet_slot' | 'admin';
  package_id?: number | null;
  package_key?: string | null;
  package_title?: string | null;
  payment_transaction_id?: number | null;
  starts_at: string;
  expires_at: string;
  status: 'active' | 'expired' | 'canceled';
  created_at: string;
}

export type PaymentStatus = 'pending' | 'paid' | 'failed';

export interface PaymentTransactionRow {
  id: number;
  user_id: number;
  package_id: number | null;
  package_title: string;
  slots: number;
  amount_toman: number;
  gateway: string;
  authority: string | null;
  ref_id: string | null;
  status: PaymentStatus;
  meta: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}




