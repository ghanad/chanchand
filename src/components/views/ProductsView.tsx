"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { ProductRow, SourceRow, ProductsPayload } from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import { formatNumber } from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { Metric } from "../common/Metric";
import { PanelHead } from "../common/PanelHead";
import { Modal } from "../common/Modal";
import { EmptyState } from "../common/EmptyState";

export function ProductsView() {
  const { isAdmin, setLoading, showToast, refreshTick, triggerRefresh } = useDashboard();
  const basePath = isAdmin ? "/admin" : "";
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Modals state
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<ProductRow | null>(null);

  // Forms state
  const [form, setForm] = useState({ title: "", url: "", source_key: "" });
  const [editProductKey, setEditProductKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", url: "", source_key: "" });

  // Filtering & search state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Interaction feedback state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [togglingKeys, setTogglingKeys] = useState<Record<string, boolean>>({});
  const [activeKebabKey, setActiveKebabKey] = useState<string | null>(null);
  const kebabTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await requestJson<ProductsPayload>("/api/products");
      setProducts(payload.products);
      setSources(payload.sources);
      setForm((current) => {
        if (current.source_key) return current;
        const defaultSource = payload.sources.find((s) => s.key === "digikala_api") || payload.sources[0];
        return { ...current, source_key: defaultSource?.key || "" };
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت لیست محصولات");
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

  const configuredSources = useMemo(() => sources.filter((source) => source.configured), [sources]);
  const activeTargetCount = products.reduce((total, p) => total + p.enabled_target_count, 0);
  const targetCount = products.reduce((total, p) => total + p.target_count, 0);
  const activeProducts = products.filter((p) => p.enabled_target_count > 0).length;
  const configProducts = useMemo(() => products.filter((p) => p.configured), [products]);
  const configuredProductCount = configProducts.length;

  const totalActive = useMemo(
    () => configProducts.filter((p) => p.enabled_target_count > 0).length,
    [configProducts],
  );
  const totalInactive = configProducts.length - totalActive;

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return configProducts.filter((product) => {
      const isActive = product.enabled_target_count > 0;
      if (statusFilter === "active" && !isActive) return false;
      if (statusFilter === "inactive" && isActive) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const matchTitle = product.title.toLowerCase().includes(q);
      const matchKey = product.key.toLowerCase().includes(q);
      const matchUrl = product.primary_target?.url.toLowerCase().includes(q);
      const matchSource = product.sources.some((s) => s.toLowerCase().includes(q));

      return matchTitle || matchKey || matchUrl || matchSource;
    });
  }, [configProducts, statusFilter, searchQuery]);

  async function addProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;
    setBusyAction("add");
    try {
      const result = await requestJson<{ product_key: string }>("/admin/config/products", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          url: form.url.trim(),
          source_key: form.source_key || null,
        }),
      });
      showToast(`محصول ${result.product_key} اضافه شد.`);
      setForm((current) => ({ title: "", url: "", source_key: current.source_key }));
      setShowAddProductModal(false);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در افزودن محصول");
    } finally {
      setBusyAction(null);
    }
  }

  function startEditProduct(product: ProductRow) {
    if (!isAdmin || !product.primary_target) return;
    setEditProductKey(product.key);
    setEditForm({
      title: product.title,
      url: product.primary_target.url,
      source_key: product.primary_target.source_key,
    });
  }

  function cancelEditProduct() {
    setEditProductKey(null);
    setEditForm({ title: "", url: "", source_key: "" });
  }

  async function updateProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !editProductKey) return;
    setBusyAction(`edit:${editProductKey}`);
    try {
      const result = await requestJson<{ product_key: string }>(
        `/admin/config/products/${encodeURIComponent(editProductKey)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            title: editForm.title.trim(),
            url: editForm.url.trim(),
            source_key: editForm.source_key || null,
          }),
        },
      );
      showToast(`محصول ${result.product_key} ویرایش شد.`);
      cancelEditProduct();
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در ویرایش محصول");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleProduct(product: ProductRow) {
    if (!isAdmin || !product.key || product.target_count === 0) return;
    const wasActive = product.enabled_target_count > 0;
    const nextActive = !wasActive;
    const nextEnabledCount = nextActive ? (product.target_count || 1) : 0;

    // 1. Optimistic update
    setProducts((prev) =>
      prev.map((p) =>
        p.key === product.key
          ? {
              ...p,
              enabled_target_count: nextEnabledCount,
              primary_target: p.primary_target ? { ...p.primary_target, enabled: nextActive } : null,
            }
          : p,
      ),
    );
    setTogglingKeys((prev) => ({ ...prev, [product.key]: true }));

    // 2. Perform API request
    try {
      const endpoint = `/admin/config/products/${encodeURIComponent(product.key)}/${
        nextActive ? "enable" : "disable"
      }`;
      const result = await requestJson<{ product_key: string }>(endpoint, { method: "POST" });
      showToast(nextActive ? `محصول ${result.product_key} فعال شد.` : `محصول ${result.product_key} غیرفعال شد.`);
      triggerRefresh();
    } catch (error) {
      // 3. Revert on failure
      setProducts((prev) =>
        prev.map((p) =>
          p.key === product.key
            ? {
                ...p,
                enabled_target_count: product.enabled_target_count,
                primary_target: product.primary_target,
              }
            : p,
        ),
      );
      showToast(error instanceof Error ? error.message : "خطا در تغییر وضعیت محصول");
    } finally {
      setTogglingKeys((prev) => {
        const next = { ...prev };
        delete next[product.key];
        return next;
      });
    }
  }

  async function handleConfirmDelete() {
    if (!isAdmin || !productToDelete?.key) return;
    const key = productToDelete.key;
    setBusyAction(`delete:${key}`);
    try {
      const result = await requestJson<{ product_key: string }>(
        `/admin/config/products/${encodeURIComponent(key)}`,
        { method: "DELETE" },
      );
      showToast(`محصول ${result.product_key} حذف شد.`);
      if (editProductKey === key) {
        cancelEditProduct();
      }
      setProductToDelete(null);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در حذف محصول");
    } finally {
      setBusyAction(null);
    }
  }

  async function copyToClipboard(url: string, key: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      showToast("آدرس اینترنتی با موفقیت کپی شد.");
      setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2000);
    } catch {
      showToast("خطا در کپی آدرس اینترنتی");
    }
  }



  return (
    <div className="products-page">
      <section className="product-summary-grid" aria-label="خلاصه محصولات">
        <Metric label="کل محصول‌ها" value={formatNumber(configuredProductCount)} />
        <Metric label="محصول فعال" value={formatNumber(activeProducts)} />
        <Metric label="هدف‌های فعال" value={`${formatNumber(activeTargetCount)} / ${formatNumber(targetCount)}`} />
        <Metric label="منابع قیمت‌گیری" value={formatNumber(configuredSources.length)} />
      </section>

      <div className={`product-grid ${isAdmin ? "" : "read-only"}`}>
        <section className="panel product-list-panel">
          <PanelHead
            title="مدیریت و پیکربندی محصولات"
            meta={`${formatNumber(configuredProductCount)} محصول`}
            action={
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <Link
                  href={`${basePath}/products`}
                  className="secondary-button compact-btn"
                  title="مشاهده کاتالوگ و ویترین محصولات"
                >
                  مشاهده کاتالوگ کالاها &rarr;
                </Link>
                {isAdmin ? (
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => setShowAddProductModal(true)}
                  >
                    + افزودن محصول
                  </button>
                ) : null}
              </div>
            }
          />

          {/* Search & Filter Toolbar */}
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
                placeholder="جستجو در عنوان، شناسه، آدرس یا منبع..."
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
                role="radio"
                aria-checked={statusFilter === "all"}
                className={`filter-pill-btn ${statusFilter === "all" ? "is-active" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                همه ({formatNumber(configuredProductCount)})
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={statusFilter === "active"}
                className={`filter-pill-btn ${statusFilter === "active" ? "is-active" : ""}`}
                onClick={() => setStatusFilter("active")}
              >
                فعال ({formatNumber(totalActive)})
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={statusFilter === "inactive"}
                className={`filter-pill-btn ${statusFilter === "inactive" ? "is-active" : ""}`}
                onClick={() => setStatusFilter("inactive")}
              >
                غیرفعال ({formatNumber(totalInactive)})
              </button>
            </div>
          </div>

          {/* Compact Product Table */}
          <div className="product-table-wrap">
            {configProducts.length === 0 ? (
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
                    <th scope="col">آدرس اینترنتی (URL)</th>
                    <th scope="col">اهداف فعال</th>
                    <th scope="col">وضعیت</th>
                    <th scope="col" className="th-actions">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const isActive = product.enabled_target_count > 0;
                    const canToggle = product.target_count > 0;
                    const isToggling = !!togglingKeys[product.key];
                    const isKebabOpen = activeKebabKey === product.key;
                    const hasPrimaryTarget = !!product.primary_target;

                    return (
                      <tr
                        key={product.key}
                        className={`product-table-row ${isActive ? "is-active" : "is-inactive"}`}
                      >
                        {/* 1. Title & Slug (bold title + small muted slug) */}
                        <td className="col-title">
                          <div className="product-title-cell product-info-text">
                            <Link
                              href={`${basePath}/products/${encodeURIComponent(product.key)}`}
                              className="product-row-title-link"
                              title={`مشاهده جزئیات و تاریخچه ${product.title}`}
                            >
                              <strong className="product-row-title">{product.title}</strong>
                            </Link>
                            <span className="product-row-slug" title={product.key}>
                              {product.key}
                            </span>
                          </div>
                        </td>

                        {/* 2. Source Badge */}
                        <td className="col-source">
                          <div className="product-info-text">
                            {product.sources.length ? (
                              product.sources.map((source) => (
                                <span className="product-source-badge" key={`${product.key}:${source}`}>
                                  {source}
                                </span>
                              ))
                            ) : (
                              <span className="product-source-badge muted">بدون منبع</span>
                            )}
                          </div>
                        </td>

                        {/* 3. URL (truncated with ellipsis, full URL in tooltip, copy button, dir="ltr") */}
                        <td className="col-url">
                          <div className="product-info-text">
                            {product.primary_target ? (
                              <div className="product-url-wrapper">
                                <button
                                  type="button"
                                  className="product-copy-btn"
                                  onClick={() => copyToClipboard(product.primary_target!.url, product.key)}
                                  aria-label={`کپی آدرس اینترنتی ${product.title}`}
                                  title={copiedKey === product.key ? "کپی شد!" : "کپی لینک"}
                                >
                                  {copiedKey === product.key ? (
                                    <svg
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="var(--ok)"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden="true"
                                    >
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  ) : (
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
                                </a>
                              </div>
                            ) : (
                              <span className="muted-text">-</span>
                            )}
                          </div>
                        </td>

                        {/* 4. Active Targets Count (e.g. 1 / 1) */}
                        <td className="col-targets">
                          <div className="product-info-text">
                            <span className="product-targets-text">
                              {formatNumber(product.enabled_target_count)} / {formatNumber(product.target_count)}
                            </span>
                          </div>
                        </td>

                        {/* 5. Status Toggle Switch */}
                        <td className="col-status">
                          <div className="status-toggle-wrapper">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isActive}
                              aria-label={
                                isActive
                                  ? `غیرفعال کردن ${product.title}`
                                  : `فعال کردن ${product.title}`
                              }
                              disabled={!canToggle || isToggling || !isAdmin}
                              className={`status-toggle-btn ${isActive ? "is-active" : ""} ${
                                isToggling ? "is-loading" : ""
                              }`}
                              onClick={() => handleToggleProduct(product)}
                              title={
                                !canToggle
                                  ? "بدون هدف فعال"
                                  : isActive
                                  ? "کلیک برای غیرفعال‌سازی"
                                  : "کلیک برای فعال‌سازی"
                              }
                            >
                              <span className="status-toggle-thumb">
                                {isToggling && (
                                  <span className="status-toggle-spinner" aria-hidden="true" />
                                )}
                              </span>
                            </button>
                            <span className={`status-toggle-label ${isActive ? "active" : ""}`}>
                              {isActive ? "فعال" : "غیرفعال"}
                            </span>
                          </div>
                        </td>

                        {/* 6. Actions: Details icon button, Edit icon button & Kebab (⋯) menu */}
                        <td className="col-actions">
                          <div className="product-actions-cell">
                            {/* Detail / Analytics Button */}
                            <Link
                              href={`${basePath}/products/${encodeURIComponent(product.key)}`}
                              className="action-icon-button"
                              title="مشاهده جزئیات و تاریخچه قیمت"
                              aria-label={`مشاهده جزئیات ${product.title}`}
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

                            {isAdmin ? (
                              <>
                                {/* Edit Icon Button */}
                                <button
                                  type="button"
                                  className="action-icon-button"
                                  onClick={() => startEditProduct(product)}
                                  disabled={!hasPrimaryTarget || busyAction !== null}
                                  aria-label={`ویرایش ${product.title}`}
                                  title="ویرایش محصول"
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

                                {/* Kebab (⋯) Menu */}
                                <div className="kebab-container">
                                  <button
                                    type="button"
                                    ref={(el) => {
                                      kebabTriggerRefs.current[product.key] = el;
                                    }}
                                    className={`action-icon-button kebab-trigger ${isKebabOpen ? "open" : ""}`}
                                    onClick={() =>
                                      setActiveKebabKey((current) =>
                                        current === product.key ? null : product.key,
                                      )
                                    }
                                    aria-label={`عملیات بیشتر برای ${product.title}`}
                                    aria-haspopup="menu"
                                    aria-expanded={isKebabOpen}
                                    title="عملیات بیشتر"
                                    onKeyDown={(e) => {
                                      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                                        setActiveKebabKey(product.key);
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
                                          setProductToDelete(product);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Escape") {
                                            setActiveKebabKey(null);
                                            kebabTriggerRefs.current[product.key]?.focus();
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
                                        <span>حذف محصول</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : null}
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

      {/* Modal: Add Product */}
      <Modal
        isOpen={showAddProductModal}
        onClose={() => setShowAddProductModal(false)}
        title="افزودن محصول جدید"
      >
        <form className="modal-form" onSubmit={addProduct}>
          <label>
            عنوان محصول
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="مثلاً: تلویزیون ۵۵ اینچ سامسونگ"
              autoComplete="off"
              required
              autoFocus
            />
          </label>
          <label>
            آدرس اینترنتی (URL)
            <input
              value={form.url}
              onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://..."
              type="url"
              dir="ltr"
              required
            />
          </label>
          <label>
            منبع قیمت‌گیری
            <select
              value={form.source_key}
              onChange={(event) => setForm((current) => ({ ...current, source_key: event.target.value }))}
            >
              {configuredSources.map((source) => (
                <option key={source.key} value={source.key}>
                  {source.key} ({source.adapter})
                </option>
              ))}
            </select>
          </label>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowAddProductModal(false)}
              disabled={busyAction === "add"}
            >
              انصراف
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={busyAction === "add"}
            >
              {busyAction === "add" ? "در حال افزودن..." : "افزودن محصول"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Product */}
      <Modal
        isOpen={editProductKey !== null}
        onClose={cancelEditProduct}
        title={`ویرایش محصول: ${editForm.title || editProductKey}`}
      >
        <form className="modal-form" onSubmit={updateProduct}>
          <label>
            عنوان محصول
            <input
              value={editForm.title}
              onChange={(event) =>
                setEditForm((current) => ({ ...current, title: event.target.value }))
              }
              autoComplete="off"
              required
              autoFocus
            />
          </label>
          <label>
            منبع قیمت‌گیری
            <select
              value={editForm.source_key}
              onChange={(event) =>
                setEditForm((current) => ({ ...current, source_key: event.target.value }))
              }
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
              onChange={(event) =>
                setEditForm((current) => ({ ...current, url: event.target.value }))
              }
              type="url"
              dir="ltr"
              placeholder="https://..."
              required
            />
          </label>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={cancelEditProduct}
              disabled={busyAction === `edit:${editProductKey}`}
            >
              انصراف
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={busyAction === `edit:${editProductKey}`}
            >
              {busyAction === `edit:${editProductKey}` ? "در حال ذخیره..." : "ذخیره تغییرات"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirmation Dialog */}
      <Modal
        isOpen={productToDelete !== null}
        onClose={() => setProductToDelete(null)}
        title="تأیید حذف محصول"
        maxWidth="460px"
      >
        <div className="confirm-delete-box">
          <p>
            آیا از حذف محصول <strong>«{productToDelete?.title}»</strong> اطمینان دارید؟
          </p>
          <p className="confirm-delete-hint">
            این عملیات برگشت‌پذیر نیست و اهداف و داده‌های مرتبط با این محصول حذف خواهند شد.
          </p>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setProductToDelete(null)}
              disabled={busyAction === `delete:${productToDelete?.key}`}
            >
              انصراف
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={handleConfirmDelete}
              disabled={busyAction === `delete:${productToDelete?.key}`}
            >
              {busyAction === `delete:${productToDelete?.key}` ? "در حال حذف..." : "حذف محصول"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
