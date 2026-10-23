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
  const [sortBy, setSortBy] = useState<"title" | "price_asc" | "price_desc" | "recent">("recent");

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

  // Filtered and sorted products
  const filteredProducts = useMemo(() => {
    return configuredProducts
      .filter((item) => {
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
      })
      .sort((a, b) => {
        if (sortBy === "title") {
          return a.title.localeCompare(b.title, "fa");
        }
        if (sortBy === "price_asc") {
          const priceA = a.latestSnapshot?.price_toman ?? Infinity;
          const priceB = b.latestSnapshot?.price_toman ?? Infinity;
          return priceA - priceB;
        }
        if (sortBy === "price_desc") {
          const priceA = a.latestSnapshot?.price_toman ?? -Infinity;
          const priceB = b.latestSnapshot?.price_toman ?? -Infinity;
          return priceB - priceA;
        }
        // "recent" by default
        const timeA = a.latestSnapshot?.observed_at ? new Date(a.latestSnapshot.observed_at).getTime() : 0;
        const timeB = b.latestSnapshot?.observed_at ? new Date(b.latestSnapshot.observed_at).getTime() : 0;
        return timeB - timeA;
      });
  }, [configuredProducts, statusFilter, searchQuery, sortBy]);

  return (
    <div className="product-catalog-page page-stack">
      {/* Metrics Summary Grid */}
      <section className="product-summary-grid" aria-label="خلاصه کاتالوگ محصولات">
        <Metric label="کل کالاها" value={formatNumber(totalCount)} />
        <Metric label="کالاهای موجود" value={formatNumber(inStockCount)} hint="دارای موجودی در فروشگاه" />
        <Metric label="ناموجود در بازار" value={formatNumber(outOfStockCount)} />
        <Metric label="رهگیری فعال" value={`${formatNumber(activeTrackingCount)} / ${formatNumber(totalCount)}`} />
      </section>

      {/* Main Catalog Panel */}
      <section className="panel catalog-main-panel">
        <PanelHead
          title="محصولات"
          meta={`${formatNumber(totalCount)} کالا`}
          action={
            isAdmin ? (
              <Link
                href={`${basePath}/manage-products`}
                className="secondary-button compact-btn"
                title="رفتن به جدول تنظیمات، افزودن و لینک‌های محصولات"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                مدیریت و افزودن محصولات
              </Link>
            ) : null
          }
        />

        {/* Toolbar: Search, Filter pills, Sort */}
        <div className="product-table-toolbar catalog-toolbar">
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
              placeholder="جستجو در نام محصول، شناسه یا فروشنده..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="جستجوی کاتالوگ محصولات"
            />
            {searchQuery && (
              <button
                type="button"
                className="product-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="پاک کردن جستجو"
                title="پاک کردن"
              >
                ✕
              </button>
            )}
          </div>

          <div className="status-filter-pills" role="radiogroup" aria-label="فیلتر وضعیت">
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

          <div className="catalog-sort-wrapper">
            <label className="catalog-sort-label">
              ترتیب:
              <select
                className="compact-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="ترتیب نمایش محصولات"
              >
                <option value="recent">آخرین بروزرسانی</option>
                <option value="price_asc">ارزان‌ترین</option>
                <option value="price_desc">گران‌ترین</option>
                <option value="title">نام محصول (الفبا)</option>
              </select>
            </label>
          </div>
        </div>

        {/* Catalog Grid Cards */}
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
          <div className="catalog-grid" aria-label="فهرست کارت‌های محصول">
            {filteredProducts.map((item) => {
              const snapshot = item.latestSnapshot;
              const hasPrice = snapshot?.price_toman !== null && snapshot?.price_toman !== undefined;
              const detailHref = `${basePath}/products/${encodeURIComponent(item.key)}`;

              return (
                <article key={item.key} className="catalog-card">
                  {/* Card Header Badges */}
                  <div className="catalog-card-header">
                    <div className="catalog-card-badges">
                      {item.sources.map((source) => (
                        <span key={source} className="product-source-badge">
                          {source}
                        </span>
                      ))}
                      <span className="product-slug-pill" title={item.key}>
                        {item.key}
                      </span>
                    </div>

                    {snapshot && (
                      <StatusPill
                        text={availabilityText(snapshot.availability)}
                        tone={snapshot.availability}
                      />
                    )}
                  </div>

                  {/* Card Title */}
                  <Link href={detailHref} className="catalog-card-title-link">
                    <h2 className="catalog-card-title" title={item.title}>
                      {item.title}
                    </h2>
                  </Link>

                  {/* Price Section */}
                  <div className="catalog-card-price-box">
                    {hasPrice ? (
                      <>
                        <div className="catalog-card-price-main">
                          <strong>{formatNumber(snapshot!.price_toman)}</strong>
                          <span className="catalog-currency-label">تومان</span>
                        </div>
                        {snapshot?.price_usd ? (
                          <div className="catalog-card-price-usd">
                            معادل {formatNumber(snapshot.price_usd)} دلار
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="catalog-card-price-none">هنوز قیمتی ثبت نشده است</div>
                    )}
                  </div>

                  {/* Seller & Date Info */}
                  <div className="catalog-card-meta">
                    <div className="catalog-card-meta-row">
                      <span className="meta-label">فروشنده:</span>
                      <span className="meta-value" title={snapshot?.seller || "نامشخص"}>
                        {snapshot?.seller || "نامشخص"}
                      </span>
                    </div>
                    {snapshot?.observed_at && (
                      <div className="catalog-card-meta-row">
                        <span className="meta-label">آخرین بررسی:</span>
                        <span className="meta-value">{formatDate(snapshot.observed_at)}</span>
                      </div>
                    )}
                  </div>

                  {/* Card Action Link */}
                  <div className="catalog-card-footer">
                    <Link href={detailHref} className="catalog-card-detail-btn">
                      <span>مشاهده تاریخچه و جزئیات</span>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                      </svg>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
