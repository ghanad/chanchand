"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ProductRow,
  SourceRow,
  PriceRow,
  ProductsPayload,
  HistoryMetric,
} from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import {
  formatNumber,
  formatDate,
  priceAxisDomain,
  numberFormatter,
  availabilityText,
} from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { Metric } from "../common/Metric";
import { PanelHead } from "../common/PanelHead";
import { Modal } from "../common/Modal";
import { EmptyState } from "../common/EmptyState";
import { StatusPill } from "../common/StatusPill";
import { HistoryTable } from "../tables/HistoryTable";

interface ProductDetailViewProps {
  productKey: string;
}

export function ProductDetailView({ productKey }: ProductDetailViewProps) {
  const router = useRouter();
  const { isAdmin, setLoading, showToast, refreshTick, triggerRefresh } = useDashboard();
  const basePath = isAdmin ? "/admin" : "";

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [history, setHistory] = useState<PriceRow[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Interaction & forms state
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isRunningNow, setIsRunningNow] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", url: "", source_key: "", is_public: false });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Chart settings
  const [chartMetric, setChartMetric] = useState<HistoryMetric>("toman");
  const [historyLimit, setHistoryLimit] = useState("200");

  // Load product info and sources
  const loadProductAndSources = useCallback(async () => {
    try {
      const payload = await requestJson<ProductsPayload>("/api/products");
      setSources(payload.sources);
      const matched = payload.products.find((p) => p.key === productKey);
      if (matched) {
        setProduct(matched);
        setEditForm({
          title: matched.title,
          url: matched.primary_target?.url || "",
          source_key: matched.primary_target?.source_key || "",
          is_public: Boolean(matched.is_public),
        });
      } else {
        setProduct(null);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت اطلاعات محصول");
    }
  }, [productKey, showToast]);

  // Load history data
  const loadHistory = useCallback(async () => {
    if (!productKey) return;
    try {
      const params = new URLSearchParams({
        product_key: productKey,
        limit: historyLimit,
      });
      const payload = await requestJson<{ rows: PriceRow[] }>(`/api/history?${params.toString()}`);
      setHistory(payload.rows);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت تاریخچه محصول");
    }
  }, [historyLimit, productKey, showToast]);

  // Combined initial data load
  useEffect(() => {
    let isMounted = true;
    async function init() {
      setLoading(true);
      await Promise.all([loadProductAndSources(), loadHistory()]);
      if (isMounted) {
        setIsInitialLoading(false);
        setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [loadProductAndSources, loadHistory, setLoading, refreshTick]);

  // Copy URL handler
  const handleCopyUrl = async () => {
    if (!product?.primary_target?.url || (product.is_public && !isAdmin)) return;
    try {
      await navigator.clipboard.writeText(product.primary_target.url);
      setCopiedUrl(true);
      showToast("آدرس اینترنتی با موفقیت کپی شد.");
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      showToast("خطا در کپی آدرس اینترنتی");
    }
  };

  // Toggle active/inactive
  const handleToggleActive = async () => {
    if (!isAdmin || !product || product.target_count === 0) return;
    const wasActive = product.enabled_target_count > 0;
    const nextActive = !wasActive;

    // Optimistic update
    setProduct((prev) =>
      prev
        ? {
            ...prev,
            enabled_target_count: nextActive ? prev.target_count || 1 : 0,
            primary_target: prev.primary_target
              ? { ...prev.primary_target, enabled: nextActive }
              : null,
          }
        : null,
    );
    setIsToggling(true);

    try {
      const endpoint = `/api/products/${encodeURIComponent(product.key)}/${
        nextActive ? "enable" : "disable"
      }`;
      await requestJson<{ product_key: string }>(endpoint, { method: "POST" });
      showToast(nextActive ? "محصول با موفقیت فعال شد." : "محصول غیرفعال شد.");
      triggerRefresh();
    } catch (error) {
      // Revert on failure
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              enabled_target_count: wasActive ? prev.target_count : 0,
              primary_target: prev.primary_target
                ? { ...prev.primary_target, enabled: wasActive }
                : null,
            }
          : null,
      );
      showToast(error instanceof Error ? error.message : "خطا در تغییر وضعیت محصول");
    } finally {
      setIsToggling(false);
    }
  };

  // Run Now handler for this specific product
  const handleRunNow = async () => {
    if (isRunningNow || !product) return;
    setIsRunningNow(true);
    try {
      const res = await requestJson<{
        run_id: number;
        success_count?: number;
        error_count?: number;
      }>(`/api/products/${encodeURIComponent(product.key)}/refresh`, {
        method: "POST",
      });

      if (res.error_count && res.error_count > 0 && res.success_count === 0) {
        showToast("استعلام قیمت با خطا مواجه شد. لطفاً اتصال اینترنت یا آدرس هدف را بررسی کنید.");
      } else {
        showToast(`قیمت «${product.title}» با موفقیت استعلام و ثبت شد.`);
      }

      await Promise.all([loadProductAndSources(), loadHistory()]);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در استعلام قیمت محصول");
    } finally {
      setIsRunningNow(false);
    }
  };

  // Edit product
  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!product?.can_edit && !isAdmin) || !product) return;
    setIsSavingEdit(true);
    try {
      await requestJson<{ product_key: string }>(
        `/api/products/${encodeURIComponent(product.key)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            title: editForm.title.trim(),
            url: editForm.url.trim(),
            source_key: editForm.source_key || null,
            is_public: isAdmin ? editForm.is_public : undefined,
          }),
        },
      );
      showToast("تغییرات محصول با موفقیت ذخیره شد.");
      setShowEditModal(false);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در ویرایش محصول");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete product
  const handleDeleteProduct = async () => {
    if ((!product?.can_edit && !isAdmin) || !product) return;
    setIsDeleting(true);
    try {
      await requestJson<{ product_key: string }>(
        `/api/products/${encodeURIComponent(product.key)}`,
        { method: "DELETE" },
      );
      showToast(`محصول «${product.title}» حذف شد.`);
      setShowDeleteModal(false);
      triggerRefresh();
      router.push(`${basePath}/products`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در حذف محصول");
      setIsDeleting(false);
    }
  };

  // Calculations for summary & chart
  const latestSnapshot = useMemo(() => {
    if (!history.length) return null;
    return history[history.length - 1];
  }, [history]);

  const { minToman, maxToman, minUsd, maxUsd } = useMemo(() => {
    let minT: number | null = null;
    let maxT: number | null = null;
    let minU: number | null = null;
    let maxU: number | null = null;

    for (const row of history) {
      if (row.price_toman !== null && Number.isFinite(row.price_toman)) {
        if (minT === null || row.price_toman < minT) minT = row.price_toman;
        if (maxT === null || row.price_toman > maxT) maxT = row.price_toman;
      }
      if (row.price_usd !== null && Number.isFinite(row.price_usd)) {
        if (minU === null || row.price_usd < minU) minU = row.price_usd;
        if (maxU === null || row.price_usd > maxU) maxU = row.price_usd;
      }
    }

    return { minToman: minT, maxToman: maxT, minUsd: minU, maxUsd: maxU };
  }, [history]);

  const metricConfig = useMemo(() => {
    return chartMetric === "usd"
      ? {
          key: "price_usd" as const,
          label: "دلار",
          suffix: "دلار",
          empty: "برای نمایش قیمت دلاری، نرخ دلار باید در سیستم ثبت شده باشد.",
        }
      : {
          key: "price_toman" as const,
          label: "تومان",
          suffix: "تومان",
          empty: "هنوز داده‌ای برای نمودار ثبت نشده است.",
        };
  }, [chartMetric]);

  const chartRows = useMemo(() => {
    return history.flatMap((row) => {
      const price = row[metricConfig.key];
      if (!Number.isFinite(price)) return [];
      return [
        {
          time: formatDate(row.observed_at),
          source: row.source_key,
          price: Number(price),
        },
      ];
    });
  }, [history, metricConfig.key]);

  const chartPriceDomain = useMemo(() => {
    return chartRows.length ? priceAxisDomain(chartRows) : undefined;
  }, [chartRows]);

  if (isInitialLoading) {
    return (
      <div className="page-stack">
        <p className="empty-state">در حال بارگذاری اطلاعات محصول...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="page-stack">
        <div className="breadcrumb-bar">
          <Link href={`${basePath}/products`} className="back-link">
            &larr; بازگشت به لیست محصولات
          </Link>
        </div>
        <section className="panel">
          <EmptyState text={`محصول با شناسه «${productKey}» یافت نشد یا حذف شده است.`} />
        </section>
      </div>
    );
  }

  const isActive = product.enabled_target_count > 0;
  const configuredSources = sources.filter((s) => s.configured);

  return (
    <div className="product-detail-page page-stack">
      {/* Top Breadcrumb & Quick Navigation */}
      <div className="breadcrumb-bar">
        <Link href={`${basePath}/products`} className="back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          بازگشت به لیست محصولات
        </Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">{product.title}</span>
      </div>

      {/* Main Product Header Card */}
      <section className="panel product-detail-header-panel">
        <div className="product-detail-header-main">
          <div className="product-title-group">
            <div className="product-badges-row">
              <span className="product-slug-pill" title="شناسه یکتای محصول">
                {product.key}
              </span>
              {product.is_public ? (
                <span className="adapter-badge brsapi_market" style={{ fontSize: "0.75rem", padding: "2px 8px" }}>
                  عمومی / بازار
                </span>
              ) : null}
              {isAdmin && product.owner_username ? (
                <span className="adapter-badge generic_html" style={{ fontSize: "0.75rem", padding: "2px 8px" }}>
                  کاربر: {product.owner_username}
                </span>
              ) : null}
              {product.sources.map((s) => (
                <span className="product-source-badge" key={s}>
                  {s}
                </span>
              ))}
              {latestSnapshot && (
                <StatusPill
                  text={availabilityText(latestSnapshot.availability)}
                  tone={latestSnapshot.availability}
                />
              )}
            </div>
            <h1 className="product-detail-title">{product.title}</h1>

            {product.is_public && !isAdmin ? (
              <div
                className="product-url-wrapper product-detail-url muted-text"
                style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}
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
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>آدرس اینترنتی این کالای عمومی برای کاربران عادی در دسترس نیست.</span>
              </div>
            ) : product.primary_target ? (
              <div className="product-url-wrapper product-detail-url">
                <button
                  type="button"
                  className="product-copy-btn"
                  onClick={handleCopyUrl}
                  title={copiedUrl ? "کپی شد!" : "کپی لینک هدف"}
                  aria-label="کپی آدرس هدف"
                >
                  {copiedUrl ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
                <a
                  href={product.primary_target.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="product-url-link"
                  dir="ltr"
                  title={product.primary_target.url}
                >
                  {product.primary_target.url}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            ) : null}
          </div>

          {/* Action Buttons for Header */}
          <div className="product-detail-actions">
            {/* Re-fetch price button only for admin or product owner */}
            {(isAdmin || product.can_edit) && (
              <button
                type="button"
                className="secondary-button"
                onClick={handleRunNow}
                disabled={isRunningNow || !isActive}
                title={isActive ? "استعلام فوری و بروزرسانی قیمت همین محصول" : "محصول غیرفعال است"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {isRunningNow ? "در حال دریافت قیمت..." : "استعلام قیمت این کالا"}
              </button>
            )}

            {/* Actions for owner or admin: Status toggle, Edit, Delete */}
            {(isAdmin || product.can_edit) && (
              <>
                <div className="status-toggle-wrapper">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    disabled={isToggling || product.target_count === 0}
                    className={`status-toggle-btn ${isActive ? "is-active" : ""} ${isToggling ? "is-loading" : ""}`}
                    onClick={handleToggleActive}
                    title={isActive ? "غیرفعال‌سازی رهگیری" : "فعال‌سازی رهگیری"}
                  >
                    <span className="status-toggle-thumb">
                      {isToggling && <span className="status-toggle-spinner" aria-hidden="true" />}
                    </span>
                  </button>
                  <span className={`status-toggle-label ${isActive ? "active" : ""}`}>
                    {isActive ? "رهگیری فعال" : "رهگیری غیرفعال"}
                  </span>
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowEditModal(true)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  ویرایش
                </button>

                <button
                  type="button"
                  className="danger-button-outline"
                  onClick={() => setShowDeleteModal(true)}
                  title="حذف محصول"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* KPI Cards Grid */}
      <section className="product-summary-grid" aria-label="شاخص‌های کلیدی محصول">
        <Metric
          label="آخرین قیمت ثبت‌شده"
          value={
            latestSnapshot?.price_toman !== null && latestSnapshot?.price_toman !== undefined
              ? `${formatNumber(latestSnapshot.price_toman)} تومان`
              : "ثبت نشده"
          }
          hint={
            latestSnapshot?.price_usd
              ? `معادل ${formatNumber(latestSnapshot.price_usd)} دلار`
              : latestSnapshot?.seller
              ? `فروشنده: ${latestSnapshot.seller}`
              : undefined
          }
        />
        <Metric
          label="کمترین قیمت تاریخی"
          value={minToman !== null ? `${formatNumber(minToman)} تومان` : "-"}
          hint={minUsd !== null ? `معادل ${formatNumber(minUsd)} دلار` : undefined}
        />
        <Metric
          label="بیشترین قیمت تاریخی"
          value={maxToman !== null ? `${formatNumber(maxToman)} تومان` : "-"}
          hint={maxUsd !== null ? `معادل ${formatNumber(maxUsd)} دلار` : undefined}
        />
        <Metric
          label="تعداد کل مشاهدات"
          value={formatNumber(history.length)}
          hint={latestSnapshot?.observed_at ? `آخرین: ${formatDate(latestSnapshot.observed_at)}` : undefined}
        />
      </section>

      {/* Chart Section */}
      <section className="panel chart-panel">
        <PanelHead
          title="روند قیمت محصول"
          meta={`${formatNumber(chartRows.length)} نقطه در نمودار`}
          action={
            <div className="chart-toolbar-actions">
              <div className="metric-toggle" aria-label="واحد نمایش نمودار">
                <button
                  type="button"
                  className={chartMetric === "toman" ? "active" : ""}
                  onClick={() => setChartMetric("toman")}
                >
                  تومان
                </button>
                <button
                  type="button"
                  className={chartMetric === "usd" ? "active" : ""}
                  onClick={() => setChartMetric("usd")}
                >
                  دلار
                </button>
              </div>

              <select
                className="compact-select"
                value={historyLimit}
                onChange={(e) => setHistoryLimit(e.target.value)}
                aria-label="تعداد مشاهدات نمودار"
              >
                <option value="50">۵۰ مشاهده اخیر</option>
                <option value="100">۱۰۰ مشاهده اخیر</option>
                <option value="200">۲۰۰ مشاهده اخیر</option>
                <option value="500">۵۰۰ مشاهده اخیر</option>
              </select>
            </div>
          }
        />
        {chartRows.length ? (
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart data={chartRows} margin={{ top: 24, right: 18, left: 18, bottom: 12 }}>
              <defs>
                <linearGradient id="productPriceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0f766e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#dce4e5" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "#647174", fontSize: 12 }} />
              <YAxis
                domain={chartPriceDomain}
                tickMargin={12}
                width={96}
                tickFormatter={(value) => numberFormatter.format(Number(value))}
                tick={{ fill: "#647174", fontSize: 12, dx: -40 }}
              />
              <Tooltip
                formatter={(value) => [
                  `${numberFormatter.format(Number(value))} ${metricConfig.suffix}`,
                  "قیمت",
                ]}
                labelFormatter={(value) => `زمان: ${value}`}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#0f766e"
                strokeWidth={3}
                fill="url(#productPriceFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text={metricConfig.empty} />
        )}
      </section>

      {/* History Snapshots Table */}
      <section className="panel">
        <PanelHead
          title="سوابق و ثبت قیمت‌ها"
          meta={`${formatNumber(history.length)} ردیف`}
        />
        <HistoryTable rows={[...history].reverse()} />
      </section>

      {/* Modal: Edit Product */}
      {(isAdmin || product.can_edit) && (
        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title={`ویرایش محصول: ${product.title}`}
        >
          <form className="modal-form" onSubmit={handleUpdateProduct}>
            <label>
              عنوان محصول
              <input
                value={editForm.title}
                onChange={(e) => setEditForm((c) => ({ ...c, title: e.target.value }))}
                required
                autoFocus
              />
            </label>
            <label>
              منبع قیمت‌گیری
              <select
                value={editForm.source_key}
                onChange={(e) => setEditForm((c) => ({ ...c, source_key: e.target.value }))}
              >
                {configuredSources.map((source) => (
                  <option key={source.key} value={source.key}>
                    {source.key} ({source.adapter})
                  </option>
                ))}
              </select>
            </label>
            <label>
              آدرس اینترنتی (URL)
              <input
                value={editForm.url}
                onChange={(e) => setEditForm((c) => ({ ...c, url: e.target.value }))}
                type="url"
                dir="ltr"
                required
              />
            </label>
            {isAdmin ? (
              <label className="modal-checkbox-row" style={{ marginTop: "4px" }}>
                <input
                  type="checkbox"
                  checked={editForm.is_public}
                  onChange={(e) => setEditForm((c) => ({ ...c, is_public: e.target.checked }))}
                />
                <span>محصول عمومی بازار (قابل مشاهده برای تمام کاربران)</span>
              </label>
            ) : null}
            <div className="modal-form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowEditModal(false)}
                disabled={isSavingEdit}
              >
                انصراف
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={isSavingEdit}
              >
                {isSavingEdit ? "در حال ذخیره..." : "ذخیره تغییرات"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Delete Confirmation */}
      {(isAdmin || product.can_edit) && (
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="تأیید حذف محصول"
          maxWidth="460px"
        >
          <div className="confirm-delete-box">
            <p>
              آیا از حذف محصول <strong>«{product.title}»</strong> اطمینان دارید؟
            </p>
            <p className="confirm-delete-hint">
              این عملیات برگشت‌پذیر نیست و تمام اهداف و سوابق متصل به این محصول حذف خواهند شد.
            </p>
            <div className="modal-form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                انصراف
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={handleDeleteProduct}
                disabled={isDeleting}
              >
                {isDeleting ? "در حال حذف..." : "بله، حذف شود"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
