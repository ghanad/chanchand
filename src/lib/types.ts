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
  owner_username?: string | null;
  created_at: string;
  updated_at: string;
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
  password_hash: string;
  role: UserRole;
  must_change_password: number;
  created_at: string;
  updated_at: string;
}

export interface SafeUser {
  id: number;
  username: string;
  email: string | null;
  role: UserRole;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}


