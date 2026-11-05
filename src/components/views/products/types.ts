import { ProductRow, PriceRow } from "../../../types/dashboard";

export interface ProductItemWithPrice extends ProductRow {
  latestSnapshot?: PriceRow | null;
}

export type SortField = "title" | "price" | "status" | "date";
export type SortDirection = "asc" | "desc";
export type ProductTab = "all" | "personal" | "public";

export interface ProductFormState {
  title: string;
  url: string;
  source_key: string;
  is_public: boolean;
  active_start_hour: number;
  active_end_hour: number;
}

export interface ProductTableRowProps {
  product: ProductItemWithPrice;
  isAdmin: boolean;
  basePath: string;
  showPublicIndicator?: boolean;
  isToggling: boolean;
  isKebabOpen: boolean;
  busyAction: string | null;
  copiedKey: string | null;
  kebabTriggerRef: (el: HTMLButtonElement | null) => void;
  onToggleKebab: () => void;
  onCloseKebab: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  onCopyUrl: (url: string) => void;
}
