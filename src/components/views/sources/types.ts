export interface SourceFormState {
  key: string;
  adapter: string;
  rate_limit_seconds: number;
  timeout_seconds: number;
  currency: string;
  price_multiplier: number;
}

export type SourceStatusFilter = "all" | "in_use" | "unused";

export interface MenuCoords {
  top?: number;
  bottom?: number;
  left: number;
  openUpwards: boolean;
}
