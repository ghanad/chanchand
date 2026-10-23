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
  products: Record<string, ProductConfig>;
  targets: TargetConfig[];
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
