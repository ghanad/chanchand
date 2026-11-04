import React from "react";
import { EmptyState } from "../../common/EmptyState";
import { formatNumber } from "../../../lib/formatters";
import { ProductRow } from "../../../types/dashboard";
import {
  ProductItemWithPrice,
  ProductTab,
  SortField,
  SortDirection,
} from "./types";
import { ProductTableRow } from "./ProductTableRow";

interface ProductsTableProps {
  configProducts: ProductRow[];
  personalProducts: ProductItemWithPrice[];
  filteredPersonal: ProductItemWithPrice[];
  filteredPublic: ProductItemWithPrice[];
  allFilteredCount: number;
  activeTab: ProductTab;
  isAdmin: boolean;
  basePath: string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortField: SortField | null;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  renderSortIndicator: (field: SortField) => React.ReactNode;
  togglingKeys: Record<string, boolean>;
  activeKebabKey: string | null;
  busyAction: string | null;
  copiedKey: string | null;
  kebabTriggerRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  setActiveKebabKey: React.Dispatch<React.SetStateAction<string | null>>;
  onOpenAddModal: () => void;
  onStartEdit: (product: ProductRow) => void;
  onToggleProduct: (product: ProductRow) => void;
  onRefreshProduct: (product: ProductRow) => void;
  onSelectProductToDelete: (product: ProductRow) => void;
  onCopyUrl: (url: string, key: string, isPublic?: boolean) => void;
}

export function ProductsTable({
  configProducts,
  personalProducts,
  filteredPersonal,
  filteredPublic,
  allFilteredCount,
  activeTab,
  isAdmin,
  basePath,
  searchQuery,
  setSearchQuery,
  sortField,
  sortDirection,
  onSort,
  renderSortIndicator,
  togglingKeys,
  activeKebabKey,
  busyAction,
  copiedKey,
  kebabTriggerRefs,
  setActiveKebabKey,
  onOpenAddModal,
  onStartEdit,
  onToggleProduct,
  onRefreshProduct,
  onSelectProductToDelete,
  onCopyUrl,
}: ProductsTableProps) {
  if (configProducts.length === 0) {
    return (
      <div className="product-table-wrap">
        <EmptyState text="هنوز هیچ محصولی ثبت نشده است." />
      </div>
    );
  }

  if (activeTab === "personal" && personalProducts.length === 0) {
    return (
      <div className="product-table-wrap">
        <div className="empty-personal-state">
          <EmptyState text="هنوز محصول شخصی اضافه نکرده‌اید." />
          <button
            type="button"
            className="primary-button"
            onClick={onOpenAddModal}
            style={{ marginTop: "1rem" }}
          >
            + افزودن محصول
          </button>
        </div>
      </div>
    );
  }

  const isEmptyFilter =
    (activeTab === "all" && allFilteredCount === 0) ||
    (activeTab === "personal" && filteredPersonal.length === 0) ||
    (activeTab === "public" && filteredPublic.length === 0);

  if (isEmptyFilter) {
    return (
      <div className="product-table-wrap">
        <div className="empty-filter-container">
          <p>هیچ محصولی با معیارهای جستجوی فعلی یافت نشد.</p>
          <button
            type="button"
            className="secondary-button compact-btn"
            onClick={() => setSearchQuery("")}
          >
            پاک کردن جستجو
          </button>
        </div>
      </div>
    );
  }

  const renderRow = (product: ProductItemWithPrice, showPublicIndicator: boolean) => (
    <ProductTableRow
      key={product.key}
      product={product}
      isAdmin={isAdmin}
      basePath={basePath}
      showPublicIndicator={showPublicIndicator}
      isToggling={Boolean(togglingKeys[product.key])}
      isKebabOpen={activeKebabKey === product.key}
      busyAction={busyAction}
      copiedKey={copiedKey}
      kebabTriggerRef={(el) => {
        kebabTriggerRefs.current[product.key] = el;
      }}
      onToggleKebab={() =>
        setActiveKebabKey((curr) => (curr === product.key ? null : product.key))
      }
      onCloseKebab={() => setActiveKebabKey(null)}
      onEdit={() => onStartEdit(product)}
      onToggle={() => onToggleProduct(product)}
      onRefresh={() => onRefreshProduct(product)}
      onDelete={() => {
        setActiveKebabKey(null);
        onSelectProductToDelete(product);
      }}
      onCopyUrl={(url) => onCopyUrl(url, product.key, product.is_public)}
    />
  );

  return (
    <div className="product-table-wrap">
      <table className="product-compact-table" aria-label="جدول محصولات">
        <thead>
          <tr>
            <th
              scope="col"
              className="sortable-th col-th-title"
              onClick={() => onSort("title")}
              aria-sort={sortField === "title" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              title="مرتب‌سازی بر اساس عنوان کالا"
            >
              <div className="th-sort-content">
                <span>عنوان و شناسه</span>
                {renderSortIndicator("title")}
              </div>
            </th>
            {isAdmin && (
              <th scope="col" className="col-th-owner" style={{ width: "110px", whiteSpace: "nowrap" }}>
                مالک
              </th>
            )}
            <th scope="col" className="col-th-source">منبع</th>
            <th scope="col" className="col-th-url">آدرس</th>
            <th
              scope="col"
              className="sortable-th col-th-price"
              onClick={() => onSort("price")}
              aria-sort={sortField === "price" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              title="مرتب‌سازی بر اساس قیمت آخرین استعلام"
            >
              <div className="th-sort-content">
                <span>آخرین قیمت</span>
                {renderSortIndicator("price")}
              </div>
            </th>
            <th
              scope="col"
              className="sortable-th col-th-status"
              onClick={() => onSort("status")}
              aria-sort={sortField === "status" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              title="مرتب‌سازی بر اساس وضعیت فعال/غیرفعال"
            >
              <div className="th-sort-content">
                <span>وضعیت</span>
                {renderSortIndicator("status")}
              </div>
            </th>
            <th
              scope="col"
              className="sortable-th col-th-date"
              onClick={() => onSort("date")}
              aria-sort={sortField === "date" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              title="مرتب‌سازی بر اساس زمان آخرین استعلام"
            >
              <div className="th-sort-content">
                <span>آخرین استعلام</span>
                {renderSortIndicator("date")}
              </div>
            </th>
            <th scope="col" className="th-actions col-th-actions">عملیات</th>
          </tr>
        </thead>
        <tbody>
          {activeTab === "all" ? (
            <>
              {filteredPersonal.length > 0 && (
                <>
                  <tr className="table-group-header-row">
                    <td colSpan={isAdmin ? 8 : 7} className="table-group-header-cell">
                      <div className="table-group-header-content">
                        <span className="table-group-title">محصولات من</span>
                        <span className="table-group-badge">{formatNumber(filteredPersonal.length)}</span>
                      </div>
                    </td>
                  </tr>
                  {filteredPersonal.map((product) => renderRow(product, false))}
                </>
              )}
              {filteredPublic.length > 0 && (
                <>
                  <tr className="table-group-header-row">
                    <td colSpan={isAdmin ? 8 : 7} className="table-group-header-cell">
                      <div className="table-group-header-content">
                        <span className="table-group-title">قیمت‌های بازار</span>
                        <span className="table-group-badge">{formatNumber(filteredPublic.length)}</span>
                      </div>
                    </td>
                  </tr>
                  {filteredPublic.map((product) => renderRow(product, true))}
                </>
              )}
            </>
          ) : activeTab === "personal" ? (
            filteredPersonal.map((product) => renderRow(product, false))
          ) : (
            filteredPublic.map((product) => renderRow(product, false))
          )}
        </tbody>
      </table>
    </div>
  );
}
