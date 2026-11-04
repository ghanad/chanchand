export interface ProductDetailEditForm {
  title: string;
  url: string;
  source_key: string;
  is_public: boolean;
}

export interface ChartRow {
  time: string;
  source: string;
  price: number;
}
