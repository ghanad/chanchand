export type Availability = "in_stock" | "out_of_stock" | "unknown" | string;
export type RunStatus = "success" | "failed" | "partial" | "running" | string;

export interface PriceRow {
  id: number;
  run_id: number;
  product_key: string;
  source_key: string;
  url: string;
  title: string | null;
  seller: string | null;
  price_irr: number | null;
  price_toman: number | null;
  price_usd: number | null;
  usd_rate_irr: number | null;
  usd_rate_toman: number | null;
  availability: Availability;
  observed_at: string | null;
}

export interface ProductRow {
  key: string;
  title: string;
  configured: boolean;
  target_count: number;
  enabled_target_count: number;
  sources: string[];
  primary_target: {
    source_key: string;
    url: string;
    enabled: boolean;
  } | null;
}

export interface SourceRow {
  key: string;
  adapter: string;
  configured: boolean;
  timeout_seconds?: number;
  rate_limit_seconds?: number;
  currency?: string;
  price_multiplier?: number;
  target_count?: number;
  enabled_target_count?: number;
  product_count?: number;
}

export interface RunRow {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  status: RunStatus;
  config_path: string;
  target_count: number;
  success_count: number;
  error_count: number;
}

export interface ErrorRow {
  id: number;
  run_id: number;
  product_key: string;
  source_key: string;
  url: string;
  error_type: string;
  message: string;
  observed_at: string | null;
}

export interface LatestPayload {
  summary: {
    product_count: number;
    latest_run: RunRow | null;
    latest_observed_at: string | null;
  };
  rows: PriceRow[];
}

export interface ProductsPayload {
  products: ProductRow[];
  sources: SourceRow[];
}

export type Tab = "overview" | "prices" | "history" | "runs" | "products" | "sources";
export type HistoryMetric = "toman" | "usd";
export type AppMode = "public" | "admin";
