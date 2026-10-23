"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { SourceRow } from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import { formatNumber } from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { Metric } from "../common/Metric";
import { PanelHead } from "../common/PanelHead";
import { Modal } from "../common/Modal";
import { EmptyState } from "../common/EmptyState";

interface SourceFormState {
  key: string;
  adapter: string;
  rate_limit_seconds: number;
  timeout_seconds: number;
  currency: string;
  price_multiplier: number;
}

const initialFormState: SourceFormState = {
  key: "",
  adapter: "digikala_api",
  rate_limit_seconds: 2,
  timeout_seconds: 15,
  currency: "IRR",
  price_multiplier: 1,
};

export function SourcesView() {
  const { isAdmin, setLoading, showToast, refreshTick, triggerRefresh } = useDashboard();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSource, setEditingSource] = useState<SourceRow | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<SourceRow | null>(null);
  const [blockedDeleteSource, setBlockedDeleteSource] = useState<SourceRow | null>(null);

  const [form, setForm] = useState<SourceFormState>(initialFormState);
  const [editForm, setEditForm] = useState<SourceFormState>(initialFormState);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_use" | "unused">("all");
  const [activeKebabKey, setActiveKebabKey] = useState<string | null>(null);
  const kebabTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await requestJson<{ sources: SourceRow[] }>("/api/sources");
      setSources(payload.sources);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت لیست منابع");
    } finally {
      setLoading(false);
    }
  }, [setLoading, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  // Close kebab menu on outside click or Esc
  useEffect(() => {
    if (!activeKebabKey) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".kebab-container")) {
        setActiveKebabKey(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const lastKey = activeKebabKey;
        setActiveKebabKey(null);
        if (lastKey && kebabTriggerRefs.current[lastKey]) {
          kebabTriggerRefs.current[lastKey]?.focus();
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeKebabKey]);

  const totalSources = sources.length;
  const uniqueAdapters = new Set(sources.map((s) => s.adapter)).size;
  const totalTargets = sources.reduce((sum, s) => sum + (s.target_count || 0), 0);
  const activeTargets = sources.reduce((sum, s) => sum + (s.enabled_target_count || 0), 0);
  const avgRateLimit = totalSources > 0
    ? (sources.reduce((sum, s) => sum + (s.rate_limit_seconds || 0), 0) / totalSources).toFixed(1)
    : "0";

  const totalInUse = useMemo(
    () => sources.filter((s) => (s.target_count || 0) > 0).length,
    [sources],
  );
  const totalUnused = totalSources - totalInUse;

  const filteredSources = useMemo(() => {
    return sources.filter((source) => {
      const inUse = (source.target_count || 0) > 0;
      if (statusFilter === "in_use" && !inUse) return false;
      if (statusFilter === "unused" && inUse) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const matchKey = source.key.toLowerCase().includes(q);
      const matchAdapter = source.adapter.toLowerCase().includes(q);
      const matchCurrency = (source.currency || "irr").toLowerCase().includes(q);
      return matchKey || matchAdapter || matchCurrency;
    });
  }, [sources, statusFilter, searchQuery]);

  function handleOpenEdit(source: SourceRow) {
    setEditingSource(source);
    setEditForm({
      key: source.key,
      adapter: source.adapter,
      rate_limit_seconds: source.rate_limit_seconds ?? 2,
      timeout_seconds: source.timeout_seconds ?? 15,
      currency: source.currency ?? "IRR",
      price_multiplier: source.price_multiplier ?? 1,
    });
  }

  async function handleAddSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;
    setBusyAction("add");
    try {
      const result = await requestJson<{ source_key: string }>("/api/admin/sources", {
        method: "POST",
        body: JSON.stringify({
          key: form.key.trim(),
          adapter: form.adapter,
          rate_limit_seconds: Number(form.rate_limit_seconds),
          timeout_seconds: Number(form.timeout_seconds),
          currency: form.currency,
          price_multiplier: Number(form.price_multiplier),
        }),
      });
      showToast(`منبع «${result.source_key}» با موفقیت افزوده شد.`);
      setForm(initialFormState);
      setShowAddModal(false);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در افزودن منبع");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !editingSource) return;
    setBusyAction(`edit:${editingSource.key}`);
    try {
      const result = await requestJson<{ source_key: string }>(
        `/api/admin/sources/${encodeURIComponent(editingSource.key)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            adapter: editForm.adapter,
            rate_limit_seconds: Number(editForm.rate_limit_seconds),
            timeout_seconds: Number(editForm.timeout_seconds),
            currency: editForm.currency,
            price_multiplier: Number(editForm.price_multiplier),
          }),
        }
      );
      showToast(`تنظیمات منبع «${result.source_key}» ذخیره شد.`);
      setEditingSource(null);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در ویرایش منبع");
    } finally {
      setBusyAction(null);
    }
  }

  function handleDeleteClick(source: SourceRow) {
    if (!isAdmin || !source.key) return;
    if (source.target_count && source.target_count > 0) {
      setBlockedDeleteSource(source);
    } else {
      setSourceToDelete(source);
    }
  }

  async function handleConfirmDelete() {
    if (!isAdmin || !sourceToDelete?.key) return;
    const key = sourceToDelete.key;
    setBusyAction(`delete:${key}`);
    try {
      await requestJson(`/api/admin/sources/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      showToast(`منبع «${key}» حذف شد.`);
      setSourceToDelete(null);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در حذف منبع");
    } finally {
      setBusyAction(null);
    }
  }

  function getMonogram(key: string): string {
    if (key.startsWith("digikala")) return "DK";
    if (key.startsWith("brsapi")) return "BR";
    if (key.startsWith("generic")) return "GH";
    return key.slice(0, 2).toUpperCase();
  }

  function getBadgeClass(adapter: string): string {
    if (adapter.includes("digikala")) return "digikala_api";
    if (adapter.includes("brsapi")) return "brsapi_market";
    if (adapter.includes("generic")) return "generic_html";
    return "default";
  }

  return (
    <div className="sources-page page-stack">
      <section className="product-summary-grid" aria-label="خلاصه آمار منابع">
        <Metric label="کل منابع قیمت‌گیری" value={formatNumber(totalSources)} />
        <Metric label="آداپتورهای فعال" value={formatNumber(uniqueAdapters)} />
        <Metric
          label="هدف‌های متصل (فعال)"
          value={`${formatNumber(activeTargets)} / ${formatNumber(totalTargets)}`}
        />
        <Metric label="میانگین نرخ وقفه" value={`${avgRateLimit} ثانیه`} />
      </section>

      <section className="panel">
        <PanelHead
          title="فهرست منابع قیمت‌گیری"
          meta={`${formatNumber(totalSources)} منبع پیکربندی‌شده`}
          action={
            isAdmin ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => setShowAddModal(true)}
              >
                + افزودن منبع جدید
              </button>
            ) : null
          }
        />

          {/* Toolbar: Search and Status Filter */}
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
                placeholder="جستجو در شناسه منبع، نوع آداپتور، ارز..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="جستجوی منابع"
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

            <div className="status-filter-pills" role="radiogroup" aria-label="فیلتر وضعیت استفاده منبع">
              <button
                type="button"
                role="radio"
                aria-checked={statusFilter === "all"}
                className={`filter-pill-btn ${statusFilter === "all" ? "is-active" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                همه ({formatNumber(totalSources)})
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={statusFilter === "in_use"}
                className={`filter-pill-btn ${statusFilter === "in_use" ? "is-active" : ""}`}
                onClick={() => setStatusFilter("in_use")}
              >
                متصل به هدف ({formatNumber(totalInUse)})
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={statusFilter === "unused"}
                className={`filter-pill-btn ${statusFilter === "unused" ? "is-active" : ""}`}
                onClick={() => setStatusFilter("unused")}
              >
                بدون هدف ({formatNumber(totalUnused)})
              </button>
            </div>
          </div>

          {/* Compact Table */}
          <div className="product-table-wrap">
            {sources.length === 0 ? (
              <EmptyState text="هنوز هیچ منبعی تعریف نشده است." />
            ) : filteredSources.length === 0 ? (
              <div className="empty-filter-container">
                <p>هیچ منبعی با معیارهای جستجو یا فیلتر فعلی یافت نشد.</p>
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
              <table className="product-compact-table source-compact-table" aria-label="جدول منابع قیمت‌گیری">
                <thead>
                  <tr>
                    <th scope="col">منبع و شناسه</th>
                    <th scope="col">نوع آداپتور</th>
                    <th scope="col">نرخ وقفه / مهلت</th>
                    <th scope="col">واحد پول و ضریب</th>
                    <th scope="col">اهداف و محصولات متصل</th>
                    <th scope="col" className="th-actions">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSources.map((source) => {
                    const isKebabOpen = activeKebabKey === source.key;
                    const targetCount = source.target_count || 0;
                    const enabledTargets = source.enabled_target_count || 0;
                    const productCount = source.product_count || 0;
                    const isUnused = targetCount === 0;

                    return (
                      <tr
                        key={source.key}
                        className={`product-table-row source-table-row ${isUnused ? "is-inactive" : "is-active"}`}
                      >
                        {/* ۱. شناسه منبع */}
                        <td className="source-col-key">
                          <div className="source-key-group product-info-text">
                            <span className="source-mini-badge" aria-hidden="true">
                              {getMonogram(source.key)}
                            </span>
                            <strong className="source-key-text" title={source.key}>
                              {source.key}
                            </strong>
                          </div>
                        </td>

                        {/* ۲. نوع آداپتور */}
                        <td className="source-col-adapter">
                          <div className="product-info-text">
                            <span className={`adapter-badge ${getBadgeClass(source.adapter)}`}>
                              {source.adapter}
                            </span>
                          </div>
                        </td>

                        {/* ۳. نرخ وقفه و مهلت زمانی */}
                        <td className="source-col-rate">
                          <div className="product-info-text">
                            <span className="source-tabular-val">
                              {source.rate_limit_seconds !== undefined ? `${source.rate_limit_seconds}s` : "-"} /{" "}
                              {source.timeout_seconds !== undefined ? `${source.timeout_seconds}s` : "-"}
                            </span>
                            <span className="source-col-sub">وقفه / مهلت</span>
                          </div>
                        </td>

                        {/* ۴. واحد پول و ضریب */}
                        <td className="source-col-currency">
                          <div className="product-info-text">
                            <span className="source-tabular-val">
                              {source.currency || "IRR"} ({source.price_multiplier !== undefined ? `× ${source.price_multiplier}` : "× 1"})
                            </span>
                          </div>
                        </td>

                        {/* ۵. اهداف و محصولات متصل */}
                        <td className="source-col-usage">
                          <div className="product-info-text">
                            {targetCount > 0 ? (
                              <span className="source-usage-text">
                                {formatNumber(enabledTargets)} هدف فعال در {formatNumber(productCount)} محصول
                              </span>
                            ) : (
                              <span className="source-usage-text muted">بدون هدف متصل</span>
                            )}
                          </div>
                        </td>

                        {/* ۶. عملیات: ویرایش و منوی کباب با حذف */}
                        <td className="source-col-actions">
                          {isAdmin ? (
                            <div className="product-actions-cell">
                              <button
                                type="button"
                                className="action-icon-button"
                                onClick={() => handleOpenEdit(source)}
                                disabled={busyAction !== null}
                                aria-label={`ویرایش منبع ${source.key}`}
                                title="ویرایش منبع"
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
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>

                              <div className="kebab-container">
                                <button
                                  type="button"
                                  ref={(el) => {
                                    kebabTriggerRefs.current[source.key] = el;
                                  }}
                                  className={`action-icon-button kebab-trigger ${isKebabOpen ? "open" : ""}`}
                                  onClick={() =>
                                    setActiveKebabKey((current) =>
                                      current === source.key ? null : source.key,
                                    )
                                  }
                                  aria-label={`عملیات بیشتر برای ${source.key}`}
                                  aria-haspopup="menu"
                                  aria-expanded={isKebabOpen}
                                  title="عملیات بیشتر"
                                  onKeyDown={(e) => {
                                    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                                      setActiveKebabKey(source.key);
                                    }
                                  }}
                                >
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    aria-hidden="true"
                                  >
                                    <circle cx="12" cy="12" r="2" />
                                    <circle cx="19" cy="12" r="2" />
                                    <circle cx="5" cy="12" r="2" />
                                  </svg>
                                </button>

                                {isKebabOpen && (
                                  <div
                                    className="kebab-menu-dropdown"
                                    role="menu"
                                    aria-orientation="vertical"
                                    tabIndex={-1}
                                  >
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="kebab-menu-item danger"
                                      onClick={() => {
                                        setActiveKebabKey(null);
                                        handleDeleteClick(source);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                          setActiveKebabKey(null);
                                          kebabTriggerRefs.current[source.key]?.focus();
                                        }
                                      }}
                                      autoFocus
                                    >
                                      <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                      >
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        <line x1="10" y1="11" x2="10" y2="17" />
                                        <line x1="14" y1="11" x2="14" y2="17" />
                                      </svg>
                                      <span>حذف منبع</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

      {/* Developer note (subtle collapsible accordion) */}
      <details className="source-guide-accordion">
        <summary>
          <span className="guide-summary-icon">💡</span>
          <span>راهنمای توسعه‌دهندگان: افزودن آداپتور جدید به سیستم</span>
        </summary>
        <div className="source-guide-content">
          <p>
            هر <strong>منبع قیمت‌گیری (Source)</strong> برای واکشی داده‌های وب‌سایت مقصد از یک <strong>آداپتور (Adapter)</strong> استفاده می‌کند. اگر وب‌سایت موردنظرتان در فهرست آداپتورهای آماده بالا نیست، پیش از ساخت منبع باید آداپتور آن در سورس‌کد پیاده شود:
          </p>
          <ol>
            <li>
              <strong>پیاده‌سازی آداپتور:</strong> کلاسی در مسیر <code>src/lib/adapters/yourSite.ts</code> بسازید که از اینترفیس <code>PriceAdapter</code> پیروی کرده و متد <code>fetch</code> را پیاده کند.
            </li>
            <li>
              <strong>ثبت در رجیستری:</strong> نام آداپتور را در نگاشت <code>adapters</code> در فایل <code>src/lib/adapters/index.ts</code> ثبت کنید.
            </li>
            <li>
              <strong>اعتبارسنجی اسکیما:</strong> شناسه آداپتور را در <code>SourceConfigSchema</code> در فایل <code>src/lib/config.ts</code> مجاز کنید.
            </li>
          </ol>
          <p className="guide-note-muted">
            نکته: برای فروشگاه‌های عمومی که با سلکتور CSS کار می‌کنند، نیازی به نوشتن کد جدید نیست و می‌توانید از آداپتور آماده <code>generic_html</code> استفاده کنید.
          </p>
        </div>
      </details>

      {/* Modal: Add Source */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="افزودن منبع قیمت‌گیری جدید"
        maxWidth="600px"
      >
        <form className="modal-form" onSubmit={handleAddSource}>
          <div className="modal-grid-2">
            <label>
              شناسه منبع (Key)
              <input
                value={form.key}
                onChange={(e) => setForm((c) => ({ ...c, key: e.target.value }))}
                placeholder="مثلاً: digikala_app"
                dir="ltr"
                required
                autoFocus
              />
              <span className="form-hint">نام انگلیسی یکتا برای شناسایی منبع در سیستم</span>
            </label>
            <label>
              نوع آداپتور
              <select
                value={form.adapter}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((c) => ({
                    ...c,
                    adapter: val,
                    currency: val === "brsapi_market" ? "TOMAN" : c.currency,
                    price_multiplier: val === "brsapi_market" ? 10 : c.price_multiplier,
                  }));
                }}
              >
                <option value="digikala_api">digikala_api (وب‌سرویس دیجی‌کالا)</option>
                <option value="digikala_web">digikala_web (خزش وب دیجی‌کالا)</option>
                <option value="servix_market">servix_market (وب‌سرویس طلا، سکه و ارز Servix)</option>
                <option value="brsapi_market">brsapi_market (وب‌سرویس طلا و ارز)</option>
                <option value="generic_html">generic_html (خزش عمومی HTML)</option>
              </select>
              <span className="form-hint">موتور دریافت قیمت (در صورت نیاز به آداپتور اختصاصی جدید، به راهنمای پایین صفحه مراجعه کنید)</span>
            </label>
          </div>
          <div className="modal-grid-2">
            <label>
              فاصله بین درخواست‌ها (ثانیه)
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={form.rate_limit_seconds}
                onChange={(e) => setForm((c) => ({ ...c, rate_limit_seconds: Number(e.target.value) }))}
                required
              />
              <span className="form-hint">وقفه بین درخواست‌های متوالی برای جلوگیری از مسدودی</span>
            </label>
            <label>
              مهلت زمانی (Timeout ثانیه)
              <input
                type="number"
                min="1"
                value={form.timeout_seconds}
                onChange={(e) => setForm((c) => ({ ...c, timeout_seconds: Number(e.target.value) }))}
                required
              />
              <span className="form-hint">حداکثر زمان انتظار برای دریافت پاسخ از سرور</span>
            </label>
          </div>
          <div className="modal-grid-2">
            <label>
              واحد پول منبع
              <select
                value={form.currency}
                onChange={(e) => {
                  const curr = e.target.value;
                  setForm((c) => ({
                    ...c,
                    currency: curr,
                    price_multiplier: curr === "TOMAN" ? 10 : 1,
                  }));
                }}
              >
                <option value="IRR">IRR (ریال)</option>
                <option value="TOMAN">TOMAN (تومان)</option>
              </select>
              <span className="form-hint">واحد پولی که قیمت با آن از سایت دریافت می‌شود</span>
            </label>
            <label>
              ضریب تبدیل به ریال
              <input
                type="number"
                min="1"
                value={form.price_multiplier}
                onChange={(e) => setForm((c) => ({ ...c, price_multiplier: Number(e.target.value) }))}
                required
              />
              <span className="form-hint">برای ریال عدد ۱ و برای تومان عدد ۱۰ وارد شود</span>
            </label>
          </div>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowAddModal(false)}
              disabled={busyAction === "add"}
            >
              انصراف
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={busyAction === "add"}
            >
              {busyAction === "add" ? "در حال ثبت..." : "افزودن منبع"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Source */}
      <Modal
        isOpen={editingSource !== null}
        onClose={() => setEditingSource(null)}
        title={`ویرایش منبع: ${editingSource?.key || ""}`}
        maxWidth="600px"
      >
        <form className="modal-form" onSubmit={handleUpdateSource}>
          <div className="modal-grid-2">
            <label>
              شناسه منبع (غیرقابل ویرایش)
              <input
                value={editForm.key}
                disabled
                dir="ltr"
                style={{ backgroundColor: "var(--surface-soft)", cursor: "not-allowed" }}
              />
            </label>
            <label>
              نوع آداپتور
              <select
                value={editForm.adapter}
                onChange={(e) => setEditForm((c) => ({ ...c, adapter: e.target.value }))}
              >
                <option value="digikala_api">digikala_api (وب‌سرویس دیجی‌کالا)</option>
                <option value="digikala_web">digikala_web (خزش وب دیجی‌کالا)</option>
                <option value="servix_market">servix_market (وب‌سرویس طلا، سکه و ارز Servix)</option>
                <option value="brsapi_market">brsapi_market (وب‌سرویس طلا و ارز)</option>
                <option value="generic_html">generic_html (خزش عمومی HTML)</option>
              </select>
            </label>
          </div>
          <div className="modal-grid-2">
            <label>
              فاصله بین درخواست‌ها (ثانیه)
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={editForm.rate_limit_seconds}
                onChange={(e) => setEditForm((c) => ({ ...c, rate_limit_seconds: Number(e.target.value) }))}
                required
              />
            </label>
            <label>
              مهلت زمانی (Timeout ثانیه)
              <input
                type="number"
                min="1"
                value={editForm.timeout_seconds}
                onChange={(e) => setEditForm((c) => ({ ...c, timeout_seconds: Number(e.target.value) }))}
                required
              />
            </label>
          </div>
          <div className="modal-grid-2">
            <label>
              واحد پول منبع
              <select
                value={editForm.currency}
                onChange={(e) => setEditForm((c) => ({ ...c, currency: e.target.value }))}
              >
                <option value="IRR">IRR (ریال)</option>
                <option value="TOMAN">TOMAN (تومان)</option>
              </select>
            </label>
            <label>
              ضریب تبدیل به ریال
              <input
                type="number"
                min="1"
                value={editForm.price_multiplier}
                onChange={(e) => setEditForm((c) => ({ ...c, price_multiplier: Number(e.target.value) }))}
                required
              />
            </label>
          </div>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setEditingSource(null)}
              disabled={busyAction?.startsWith("edit:")}
            >
              انصراف
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={busyAction?.startsWith("edit:")}
            >
              {busyAction?.startsWith("edit:") ? "در حال ذخیره..." : "ذخیره تغییرات"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirmation Dialog */}
      <Modal
        isOpen={sourceToDelete !== null}
        onClose={() => setSourceToDelete(null)}
        title="تأیید حذف منبع"
        maxWidth="460px"
      >
        <div className="confirm-delete-box">
          <p>
            آیا از حذف منبع <strong>«{sourceToDelete?.key}»</strong> اطمینان دارید؟
          </p>
          <p className="confirm-delete-hint">
            این عملیات برگشت‌پذیر نیست و این منبع از سیستم حذف خواهد شد.
          </p>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setSourceToDelete(null)}
              disabled={busyAction === `delete:${sourceToDelete?.key}`}
            >
              انصراف
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={handleConfirmDelete}
              disabled={busyAction === `delete:${sourceToDelete?.key}`}
            >
              {busyAction === `delete:${sourceToDelete?.key}` ? "در حال حذف..." : "حذف منبع"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Blocked Delete Info */}
      <Modal
        isOpen={blockedDeleteSource !== null}
        onClose={() => setBlockedDeleteSource(null)}
        title="عدم امکان حذف منبع"
        maxWidth="460px"
      >
        <div className="confirm-delete-box">
          <p>
            امکان حذف منبع <strong>«{blockedDeleteSource?.key}»</strong> وجود ندارد.
          </p>
          <p className="confirm-delete-hint">
            این منبع در حال حاضر در{" "}
            <strong>{formatNumber(blockedDeleteSource?.target_count || 0)} هدف قیمت‌گیری</strong> فعال
            است. برای حذف این منبع، ابتدا باید اهداف یا محصولات متصل به آن را حذف یا ویرایش کنید.
          </p>
          <div className="modal-form-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => setBlockedDeleteSource(null)}
            >
              متوجه شدم
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
