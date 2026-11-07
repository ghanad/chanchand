export interface ProductDetailEditForm {
  title: string;
  url: string;
  source_key: string;
  is_public: boolean;
  show_usd_chart: boolean;
  active_start_hour: number;
  active_end_hour: number;
}

export interface ChartRow {
  time: string;
  source: string;
  price: number;
}
