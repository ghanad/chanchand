"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { ProductRow, SourceRow, PriceRow, ProductsPayload, LatestPayload } from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import { formatNumber, formatDate, availabilityText } from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { Metric } from "../common/Metric";
import { PanelHead } from "../common/PanelHead";
import { StatusPill } from "../common/StatusPill";
import { EmptyState } from "../common/EmptyState";

interface ProductCatalogItem extends ProductRow {
  latestSnapshot?: PriceRow | null;
}

export function ProductCatalogView() {
  const { isAdmin, setLoading, showToast, refreshTick } = useDashboard();
  const basePath = isAdmin ? "/admin" : "";

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [latestPrices, setLatestPrices] = useState<PriceRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_stock" | "out_of_stock" | "active">("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [productsData, latestData] = await Promise.all([
        requestJson<ProductsPayload>("/api/products"),
        requestJson<LatestPayload>("/api/latest"),
      ]);
      setProducts(productsData.products);
      setSources(productsData.sources);
      setLatestPrices(latestData.rows);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت لیست محصولات");
    } finally {
      setLoading(false);
    }
  }, [setLoading, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  // Combine products with their latest snapshot
  const catalogItems: ProductCatalogItem[] = useMemo(() => {
    const priceMap = new Map<string, PriceRow>();
    for (const row of latestPrices) {
      if (!priceMap.has(row.product_key)) {
        priceMap.set(row.product_key, row);
      }
    }

    return products.map((product) => ({
      ...product,
      latestSnapshot: priceMap.get(product.key) || null,
    }));
  }, [products, latestPrices]);

  // Metrics summary
  const configuredProducts = useMemo(() => catalogItems.filter((p) => p.configured), [catalogItems]);
  const totalCount = configuredProducts.length;
  const inStockCount = configuredProducts.filter((p) => p.latestSnapshot?.availability === "in_stock").length;
  const outOfStockCount = configuredProducts.filter((p) => p.latestSnapshot?.availability === "out_of_stock").length;
  const activeTrackingCount = configuredProducts.filter((p) => p.enabled_target_count > 0).length;

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return configuredProducts.filter((item) => {
      if (statusFilter === "in_stock" && item.latestSnapshot?.availability !== "in_stock") return false;
      if (statusFilter === "out_of_stock" && item.latestSnapshot?.availability !== "out_of_stock") return false;
      if (statusFilter === "active" && item.enabled_target_count === 0) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchKey = item.key.toLowerCase().includes(q);
      const matchSeller = item.latestSnapshot?.seller?.toLowerCase().includes(q) || false;
      const matchSource = item.sources.some((s) => s.toLowerCase().includes(q));

      return matchTitle || matchKey || matchSeller || matchSource;
    });
  }, [configuredProducts, statusFilter, searchQuery]);

  return (
    <div className="product-catalog-page page-stack">
      {/* Metrics Summary Grid */}
      <section className="product-summary-grid" aria-label="خلاصه محصولات">
        <Metric label="کل محصول‌ها" value={formatNumber(totalCount)} />
        <Metric label="کالاهای موجود" value={formatNumber(inStockCount)} hint="دارای موجودی در بازار" />
        <Metric label="ناموجود در بازار" value={formatNumber(outOfStockCount)} />
        <Metric label="رهگیری فعال" value={`${formatNumber(activeTrackingCount)} / ${formatNumber(totalCount)}`} />
      </section>

      {/* Main Panel */}
      <section className="panel product-list-panel">
        <PanelHead
          title="محصولات"
          meta={`${formatNumber(totalCount)} محصول`}
          action={
            isAdmin ? (
              <Link
                href={`${basePath}/manage-products`}
                className="primary-button compact-btn"
                title="رفتن به جدول تنظیمات، افزودن و لینک‌های محصولات"
              >
                + مدیریت و افزودن محصول
              </Link>
            ) : null
          }
        />

        {/* Search & Filter Toolbar (Identical to manage-products) */}
        <div className="product-table-toolbar">
          <div className="product-search-wrapper">
            <span className="product-search-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="product-search-input"
              placeholder="جستجو در عنوان، شناسه، فروشنده یا منبع..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="جستجوی محصولات"
            />
            {searchQuery && (
              <button
                type="button"
                className="product-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="پاک کردن متن جستجو"
                title="پاک کردن"
              >
                ✕
              </button>
            )}
          </div>

          <div className="status-filter-pills" role="radiogroup" aria-label="فیلتر وضعیت محصول">
            <button
              type="button"
              className={`filter-pill-btn ${statusFilter === "all" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              همه ({formatNumber(totalCount)})
            </button>
            <button
              type="button"
              className={`filter-pill-btn ${statusFilter === "in_stock" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("in_stock")}
            >
              موجود ({formatNumber(inStockCount)})
            </button>
            <button
              type="button"
              className={`filter-pill-btn ${statusFilter === "out_of_stock" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("out_of_stock")}
            >
              ناموجود ({formatNumber(outOfStockCount)})
            </button>
            <button
              type="button"
              className={`filter-pill-btn ${statusFilter === "active" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("active")}
            >
              رهگیری فعال ({formatNumber(activeTrackingCount)})
            </button>
          </div>
        </div>

        {/* Compact Table (Identical to manage-products) */}
        <div className="product-table-wrap">
          {totalCount === 0 ? (
            <EmptyState text="هنوز هیچ محصولی ثبت نشده است." />
          ) : filteredProducts.length === 0 ? (
            <div className="empty-filter-container">
              <p>هیچ محصولی با معیارهای جستجو یا فیلتر فعلی یافت نشد.</p>
              <button
                type="button"
                className="secondary-button compact-btn"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
              >
                پاک کردن فیلترها
              </button>
            </div>
          ) : (
            <table className="product-compact-table" aria-label="جدول محصولات">
              <thead>
                <tr>
                  <th scope="col">عنوان و شناسه</th>
                  <th scope="col">منبع</th>
                  <th scope="col">آخرین قیمت</th>
                  <th scope="col">وضعیت موجودی</th>
                  <th scope="col">فروشنده</th>
                  <th scope="col">آخرین استعلام</th>
                  <th scope="col" className="th-actions">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((item) => {
                  const snapshot = item.latestSnapshot;
                  const hasPrice = snapshot?.price_toman !== null && snapshot?.price_toman !== undefined;
                  const detailHref = `${basePath}/products/${encodeURIComponent(item.key)}`;
                  const isActive = item.enabled_target_count > 0;

                  return (
                    <tr
                      key={item.key}
                      className={`product-table-row ${isActive ? "is-active" : "is-inactive"}`}
                    >
                      {/* 1. Title & Slug (bold clickable title + small muted slug) */}
                      <td className="col-title">
                        <div className="product-title-cell product-info-text">
                          <Link
                            href={detailHref}
                            className="product-row-title-link"
                            title={`مشاهده جزئیات و تاریخچه ${item.title}`}
                          >
                            <strong className="product-row-title">{item.title}</strong>
                          </Link>
                          <span className="product-row-slug" title={item.key}>
                            {item.key}
                          </span>
                        </div>
                      </td>

                      {/* 2. Source Badge */}
                      <td className="col-source">
                        <div className="product-info-text">
                          {item.sources.length ? (
                            item.sources.map((source) => (
                              <span className="product-source-badge" key={`${item.key}:${source}`}>
                                {source}
                              </span>
                            ))
                          ) : (
                            <span className="product-source-badge muted">بدون منبع</span>
                          )}
                        </div>
                      </td>

                      {/* 3. Latest Price */}
                      <td className="col-price">
                        <div className="product-info-text">
                          {hasPrice ? (
                            <div className="catalog-table-price">
                              <strong className="catalog-price-val">
                                {formatNumber(snapshot!.price_toman)} تومان
                              </strong>
                              {snapshot?.price_usd ? (
                                <span className="catalog-usd-val">
                                  ({formatNumber(snapshot.price_usd)} دلار)
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="muted-text">-</span>
                          )}
                        </div>
                      </td>

                      {/* 4. Availability Status */}
                      <td className="col-status">
                        <div className="product-info-text">
                          {snapshot ? (
                            <StatusPill
                              text={availabilityText(snapshot.availability)}
                              tone={snapshot.availability}
                            />
                          ) : (
                            <span className="muted-text">-</span>
                          )}
                        </div>
                      </td>

                      {/* 5. Seller */}
                      <td className="col-seller">
                        <div className="product-info-text">
                          <span title={snapshot?.seller || "-"}>{snapshot?.seller || "-"}</span>
                        </div>
                      </td>

                      {/* 6. Last Checked Time */}
                      <td className="col-date">
                        <div className="product-info-text">
                          <span className="muted-text">
                            {snapshot?.observed_at ? formatDate(snapshot.observed_at) : "-"}
                          </span>
                        </div>
                      </td>

                      {/* 7. Action: View Details */}
                      <td className="col-actions">
                        <div className="product-actions-cell">
                          <Link
                            href={detailHref}
                            className="action-icon-button"
                            title="مشاهده جزئیات و تاریخچه قیمت"
                            aria-label={`مشاهده جزئیات ${item.title}`}
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <line x1="18" y1="20" x2="18" y2="10" />
                              <line x1="12" y1="20" x2="12" y2="4" />
                              <line x1="6" y1="20" x2="6" y2="14" />
                            </svg>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
