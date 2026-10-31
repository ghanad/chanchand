"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProductRow, SourceRow, ProductsPayload, PriceRow, LatestPayload } from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import { formatNumber, formatDate } from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { PanelHead } from "../common/PanelHead";
import { Modal } from "../common/Modal";
import { EmptyState } from "../common/EmptyState";

interface ProductItemWithPrice extends ProductRow {
  latestSnapshot?: PriceRow | null;
}

type SortField = "title" | "price" | "status" | "date";
type SortDirection = "asc" | "desc";
type ProductTab = "all" | "personal" | "public";

export function ProductsView() {
  const router = useRouter();
  const { isAdmin, setLoading, showToast, refreshTick, triggerRefresh } = useDashboard();
  const basePath = isAdmin ? "/admin" : "";
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [latestPrices, setLatestPrices] = useState<PriceRow[]>([]);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Modals state
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<ProductRow | null>(null);

  // Forms state
  const [form, setForm] = useState({ title: "", url: "", source_key: "", is_public: false });
  const [editProductKey, setEditProductKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", url: "", source_key: "", is_public: false });

  // Filtering & search state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ProductTab>("all");

  // Interaction feedback state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [togglingKeys, setTogglingKeys] = useState<Record<string, boolean>>({});
  const [activeKebabKey, setActiveKebabKey] = useState<string | null>(null);
  const kebabTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [payload, latestPayload] = await Promise.all([
        requestJson<ProductsPayload>("/api/products"),
        requestJson<LatestPayload>("/api/latest").catch(() => ({ rows: [] as PriceRow[], summary: null })),
      ]);
      setProducts(payload.products);
      setSources(payload.sources);
      if (latestPayload && Array.isArray(latestPayload.rows)) {
        setLatestPrices(latestPayload.rows);
      }
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
  const configProducts = useMemo(() => products.filter((p) => p.configured), [products]);
  const configuredProductCount = configProducts.length;

  const totalActive = useMemo(
    () => configProducts.filter((p) => p.enabled_target_count > 0).length,
    [configProducts],
  );
  const totalInactive = configProducts.length - totalActive;

  // Combine products with latest prices
  const productsWithPrices = useMemo<ProductItemWithPrice[]>(() => {
    const priceMap = new Map<string, PriceRow>();
    for (const row of latestPrices) {
      if (!priceMap.has(row.product_key)) {
        priceMap.set(row.product_key, row);
      }
    }
    return configProducts.map((p) => ({
      ...p,
      latestSnapshot: priceMap.get(p.key) || null,
    }));
  }, [configProducts, latestPrices]);

  // Search filter matcher
  const matchesSearch = useCallback(
    (product: ProductItemWithPrice) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const matchTitle = product.title.toLowerCase().includes(q);
      const matchKey = product.key.toLowerCase().includes(q);
      const matchUrl = (!product.is_public || isAdmin) && Boolean(product.primary_target?.url.toLowerCase().includes(q));
      const matchSource = product.sources.some((s) => s.toLowerCase().includes(q));
      return matchTitle || matchKey || matchUrl || matchSource;
    },
    [searchQuery, isAdmin]
  );

  // Sorting function
  const sortList = useCallback(
    (items: ProductItemWithPrice[]) => {
      if (!sortField) return items;

      return [...items].sort((a, b) => {
        let comparison = 0;
        if (sortField === "title") {
          comparison = a.title.localeCompare(b.title, "fa", { numeric: true, sensitivity: "base" });
        } else if (sortField === "price") {
          const priceA = a.latestSnapshot?.price_toman ?? null;
          const priceB = b.latestSnapshot?.price_toman ?? null;
          if (priceA === null && priceB === null) comparison = 0;
          else if (priceA === null) comparison = 1;
          else if (priceB === null) comparison = -1;
          else comparison = priceA - priceB;
        } else if (sortField === "status") {
          const activeA = a.enabled_target_count > 0 ? 1 : 0;
          const activeB = b.enabled_target_count > 0 ? 1 : 0;
          comparison = activeA - activeB;
        } else if (sortField === "date") {
          const dateA = a.latestSnapshot?.observed_at ? new Date(a.latestSnapshot.observed_at).getTime() : 0;
          const dateB = b.latestSnapshot?.observed_at ? new Date(b.latestSnapshot.observed_at).getTime() : 0;
          comparison = dateA - dateB;
        }

        return sortDirection === "asc" ? comparison : -comparison;
      });
    },
    [sortField, sortDirection]
  );

  // Partition products into personal and public market
  const personalProducts = useMemo(
    () => productsWithPrices.filter((p) => !p.is_public),
    [productsWithPrices]
  );
  const publicProducts = useMemo(
    () => productsWithPrices.filter((p) => Boolean(p.is_public)),
    [productsWithPrices]
  );

  // Filtered and sorted lists
  const filteredPersonal = useMemo(
    () => sortList(personalProducts.filter(matchesSearch)),
    [personalProducts, matchesSearch, sortList]
  );
  const filteredPublic = useMemo(
    () => sortList(publicProducts.filter(matchesSearch)),
    [publicProducts, matchesSearch, sortList]
  );
  const allFilteredCount = filteredPersonal.length + filteredPublic.length;

  function handleSort(field: SortField) {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortField(null);
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  function renderSortIndicator(field: SortField) {
    if (sortField !== field) {
      return (
        <span className="sort-indicator neutral" aria-hidden="true" title="مرتب‌سازی">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 15l5 5 5-5" />
            <path d="M7 9l5-5 5 5" />
          </svg>
        </span>
      );
    }
    return (
      <span className="sort-indicator active" aria-hidden="true">
        {sortDirection === "asc" ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </span>
    );
  }

  async function addProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("add");
    try {
      const result = await requestJson<{ product_key: string }>("/api/products", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          url: form.url.trim(),
          source_key: form.source_key || null,
          is_public: isAdmin ? form.is_public : false,
        }),
      });
      showToast(`محصول ${result.product_key} اضافه شد.`);
      setForm((current) => ({ title: "", url: "", source_key: current.source_key, is_public: false }));
      setShowAddProductModal(false);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در افزودن محصول");
    } finally {
      setBusyAction(null);
    }
  }

  function startEditProduct(product: ProductRow) {
    if ((!product.can_edit && !isAdmin) || !product.primary_target) return;
    setEditProductKey(product.key);
    setEditForm({
      title: product.title,
      url: product.primary_target.url,
      source_key: product.primary_target.source_key,
      is_public: Boolean(product.is_public),
    });
  }

  function cancelEditProduct() {
    setEditProductKey(null);
    setEditForm({ title: "", url: "", source_key: "", is_public: false });
  }

  async function updateProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editProductKey) return;
    setBusyAction(`edit:${editProductKey}`);
    try {
      const result = await requestJson<{ product_key: string }>(
        `/api/products/${encodeURIComponent(editProductKey)}`,
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
    if ((!product.can_edit && !isAdmin) || !product.key || product.target_count === 0) return;
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
      const endpoint = `/api/products/${encodeURIComponent(product.key)}/${
        nextActive ? "enable" : "disable"
      }`;
      const result = await requestJson<{ product_key: string }>(endpoint, { method: "POST" });
      showToast(
        nextActive
          ? `محصول «${product.title}» فعال شد (جمع‌آوری خودکار قیمت فعال شد).`
          : `محصول «${product.title}» غیرفعال شد (جمع‌آوری خودکار قیمت متوقف شد).`
      );
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
    if ((!productToDelete?.can_edit && !isAdmin) || !productToDelete?.key) return;
    const key = productToDelete.key;
    setBusyAction(`delete:${key}`);
    try {
      const result = await requestJson<{ product_key: string }>(
        `/api/products/${encodeURIComponent(key)}`,
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

  async function copyToClipboard(url: string, key: string, isPublic?: boolean) {
    if (isPublic && !isAdmin) return;
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

  const handleRefreshProduct = async (product: ProductRow) => {
    if (busyAction !== null) return;
    setBusyAction(`refresh:${product.key}`);
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
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در استعلام قیمت محصول");
    } finally {
      setBusyAction(null);
    }
  };



  return (
    <div className="products-page">
      <div className={`product-grid ${isAdmin ? "" : "read-only"}`}>
        <section className="panel product-list-panel">
          <PanelHead
            title="مدیریت و پیکربندی محصولات"
            meta={`${formatNumber(configuredProductCount)} محصول`}
            action={
              <button
                className="primary-button"
                type="button"
                onClick={() => setShowAddProductModal(true)}
              >
                + افزودن محصول
              </button>
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

            <div className="status-filter-pills" role="tablist" aria-label="دسته‌بندی محصولات">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "all"}
                className={`filter-pill-btn ${activeTab === "all" ? "is-active" : ""}`}
                onClick={() => setActiveTab("all")}
              >
                همه ({formatNumber(configuredProductCount)})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "personal"}
                className={`filter-pill-btn ${activeTab === "personal" ? "is-active" : ""}`}
                onClick={() => setActiveTab("personal")}
              >
                محصولات من ({formatNumber(personalProducts.length)})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "public"}
                className={`filter-pill-btn ${activeTab === "public" ? "is-active" : ""}`}
                onClick={() => setActiveTab("public")}
              >
                بازار عمومی ({formatNumber(publicProducts.length)})
              </button>
            </div>
          </div>

          {/* Compact Product Table */}
          <div className="product-table-wrap">
            {configProducts.length === 0 ? (
              <EmptyState text="هنوز هیچ محصولی ثبت نشده است." />
            ) : activeTab === "personal" && personalProducts.length === 0 ? (
              <div className="empty-personal-state">
                <EmptyState text="هنوز محصول شخصی اضافه نکرده‌اید." />
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setShowAddProductModal(true)}
                  style={{ marginTop: "1rem" }}
                >
                  + افزودن محصول
                </button>
              </div>
            ) : (activeTab === "all" && allFilteredCount === 0) ||
              (activeTab === "personal" && filteredPersonal.length === 0) ||
              (activeTab === "public" && filteredPublic.length === 0) ? (
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
            ) : (
              <table className="product-compact-table" aria-label="جدول محصولات">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sortable-th col-th-title"
                      onClick={() => handleSort("title")}
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
                      onClick={() => handleSort("price")}
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
                      onClick={() => handleSort("status")}
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
                      onClick={() => handleSort("date")}
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
                          {filteredPersonal.map((product) => (
                            <ProductTableRow
                              key={product.key}
                              product={product}
                              isAdmin={isAdmin}
                              basePath={basePath}
                              showPublicIndicator={false}
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
                              onEdit={() => startEditProduct(product)}
                              onToggle={() => handleToggleProduct(product)}
                              onRefresh={() => handleRefreshProduct(product)}
                              onDelete={() => {
                                setActiveKebabKey(null);
                                setProductToDelete(product);
                              }}
                              onCopyUrl={(url) => copyToClipboard(url, product.key, product.is_public)}
                            />
                          ))}
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
                          {filteredPublic.map((product) => (
                            <ProductTableRow
                              key={product.key}
                              product={product}
                              isAdmin={isAdmin}
                              basePath={basePath}
                              showPublicIndicator={true}
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
                              onEdit={() => startEditProduct(product)}
                              onToggle={() => handleToggleProduct(product)}
                              onRefresh={() => handleRefreshProduct(product)}
                              onDelete={() => {
                                setActiveKebabKey(null);
                                setProductToDelete(product);
                              }}
                              onCopyUrl={(url) => copyToClipboard(url, product.key, product.is_public)}
                            />
                          ))}
                        </>
                      )}
                    </>
                  ) : activeTab === "personal" ? (
                    filteredPersonal.map((product) => (
                      <ProductTableRow
                        key={product.key}
                        product={product}
                        isAdmin={isAdmin}
                        basePath={basePath}
                        showPublicIndicator={false}
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
                        onEdit={() => startEditProduct(product)}
                        onToggle={() => handleToggleProduct(product)}
                        onRefresh={() => handleRefreshProduct(product)}
                        onDelete={() => {
                          setActiveKebabKey(null);
                          setProductToDelete(product);
                        }}
                        onCopyUrl={(url) => copyToClipboard(url, product.key, product.is_public)}
                      />
                    ))
                  ) : (
                    filteredPublic.map((product) => (
                      <ProductTableRow
                        key={product.key}
                        product={product}
                        isAdmin={isAdmin}
                        basePath={basePath}
                        showPublicIndicator={false}
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
                        onEdit={() => startEditProduct(product)}
                        onToggle={() => handleToggleProduct(product)}
                        onRefresh={() => handleRefreshProduct(product)}
                        onDelete={() => {
                          setActiveKebabKey(null);
                          setProductToDelete(product);
                        }}
                        onCopyUrl={(url) => copyToClipboard(url, product.key, product.is_public)}
                      />
                    ))
                  )}
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
          {isAdmin ? (
            <label className="modal-checkbox-row" style={{ marginTop: "4px" }}>
              <input
                type="checkbox"
                checked={form.is_public}
                onChange={(event) => setForm((current) => ({ ...current, is_public: event.target.checked }))}
              />
              <span>محصول عمومی بازار (قابل مشاهده برای تمام کاربران)</span>
            </label>
          ) : null}
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
          {isAdmin ? (
            <label className="modal-checkbox-row" style={{ marginTop: "4px" }}>
              <input
                type="checkbox"
                checked={editForm.is_public}
                onChange={(event) => setEditForm((current) => ({ ...current, is_public: event.target.checked }))}
              />
              <span>محصول عمومی بازار (قابل مشاهده برای تمام کاربران)</span>
            </label>
          ) : null}
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

interface ProductTableRowProps {
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

function ProductTableRow({
  product,
  isAdmin,
  basePath,
  showPublicIndicator = false,
  isToggling,
  isKebabOpen,
  busyAction,
  copiedKey,
  kebabTriggerRef,
  onToggleKebab,
  onCloseKebab,
  onEdit,
  onToggle,
  onRefresh,
  onDelete,
  onCopyUrl,
}: ProductTableRowProps) {
  const router = useRouter();
  const isActive = product.enabled_target_count > 0;
  const canToggle = product.target_count > 0;
  const hasPrimaryTarget = Boolean(product.primary_target);
  const canEdit = Boolean(product.can_edit || isAdmin);
  const detailUrl = `${basePath}/products/${encodeURIComponent(product.key)}`;

  return (
    <tr
      className={`product-table-row clickable-row ${isActive ? "is-active" : "is-inactive"}`}
      tabIndex={0}
      role="link"
      aria-label={`مشاهده جزئیات ${product.title}`}
      onClick={() => router.push(detailUrl)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          router.push(detailUrl);
        }
      }}
    >
      {/* 1. Title & Slug (bold title with 2-line clamp, bidi handling, full tooltip) */}
      <td className="col-title">
        <div className="product-title-cell product-info-text">
          <div className="product-title-line">
            <Link
              href={detailUrl}
              className="product-row-title-link"
              title={product.title}
              onClick={(e) => e.stopPropagation()}
            >
              <strong className="product-row-title" title={product.title} dir="auto">
                {product.title}
              </strong>
            </Link>
            {showPublicIndicator && product.is_public ? (
              <span
                className="public-market-indicator"
                title="کالای بازار عمومی (مشترک بین تمام کاربران)"
                aria-label="کالای بازار عمومی"
                onClick={(e) => e.stopPropagation()}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </span>
            ) : null}
          </div>
          <span className="product-row-slug" title={product.key} dir="ltr">
            {product.key}
          </span>
        </div>
      </td>

      {/* Owner Column for Admin */}
      {isAdmin && (
        <td className="col-owner" onClick={(e) => e.stopPropagation()}>
          <div className="product-info-text">
            {product.owner_username ? (
              <span
                className="adapter-badge generic_html"
                title={`مالک کالا: ${product.owner_username}`}
              >
                {product.owner_username}
              </span>
            ) : (
              <span
                className="adapter-badge brsapi_market"
                title="کالای عمومی سیستم بدون مالک اختصاصی"
              >
                سیستم/عمومی
              </span>
            )}
          </div>
        </td>
      )}

      {/* 2. Source Badge */}
      <td className="col-source" onClick={(e) => e.stopPropagation()}>
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

      {/* 3. Address Column */}
      <td className="col-url" onClick={(e) => e.stopPropagation()}>
        <div className="product-info-text">
          {product.is_public && !isAdmin ? (
            <span
              className="private-address-badge icon-only"
              title="آدرس منبع برای کالاهای عمومی بازار محرمانه است و توسط سیستم مدیریت می‌شود."
              aria-label="آدرس منبع محرمانه است"
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
            </span>
          ) : product.primary_target ? (
            <a
              href={product.primary_target.url}
              target="_blank"
              rel="noopener noreferrer"
              className="product-url-link icon-only"
              aria-label={`مشاهده صفحه محصول در سایت مقصد`}
              title={`مشاهده صفحه محصول در سایت مقصد: ${product.primary_target.url}`}
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
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          ) : (
            <span className="muted-text">-</span>
          )}
        </div>
      </td>

      {/* 4. Latest Price */}
      <td className="col-price">
        <div className="product-info-text">
          {product.latestSnapshot?.price_toman != null ? (
            <div className="catalog-table-price">
              <strong className="catalog-price-val">
                {formatNumber(product.latestSnapshot.price_toman)} تومان
              </strong>
              {product.latestSnapshot.price_usd != null ? (
                <span className="catalog-usd-val">
                  ({formatNumber(product.latestSnapshot.price_usd)} دلار)
                </span>
              ) : null}
            </div>
          ) : (
            <span className="muted-text">-</span>
          )}
        </div>
      </td>

      {/* 5. Status Column (Interactive Switch for editable, Static Badge for read-only public) */}
      <td className="col-status" onClick={(e) => e.stopPropagation()}>
        {canEdit ? (
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
              disabled={!canToggle || isToggling}
              className={`status-toggle-btn ${isActive ? "is-active" : "is-inactive"} ${
                isToggling ? "is-loading" : ""
              }`}
              onClick={onToggle}
              title={
                !canToggle
                  ? "بدون هدف فعال"
                  : isActive
                  ? "کلیک برای غیرفعال‌سازی (توقف جمع‌آوری قیمت)"
                  : "کلیک برای فعال‌سازی (از سرگیری استعلام قیمت)"
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
        ) : (
          <div className="status-readonly-wrapper">
            <span
              className={`status-static-badge ${isActive ? "active" : "inactive"}`}
              title={isActive ? "محصول در سیستم فعال است" : "محصول در سیستم غیرفعال است"}
            >
              <span className="status-dot" aria-hidden="true" />
              <span>{isActive ? "فعال" : "غیرفعال"}</span>
            </span>
          </div>
        )}
      </td>

      {/* 6. Last Check Observation Time */}
      <td className="col-date">
        <div className="product-info-text">
          {product.latestSnapshot?.observed_at ? (
            <span className="muted-text" title={product.latestSnapshot.observed_at}>
              {formatDate(product.latestSnapshot.observed_at)}
            </span>
          ) : (
            <span className="muted-text">-</span>
          )}
        </div>
      </td>

      {/* 7. Actions */}
      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
        <div className="product-actions-cell">
          {canEdit ? (
            <>
              {/* Edit Icon Button */}
              <button
                type="button"
                className="action-icon-button"
                onClick={onEdit}
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
                  ref={kebabTriggerRef}
                  className={`action-icon-button kebab-trigger ${isKebabOpen ? "open" : ""}`}
                  onClick={onToggleKebab}
                  aria-label={`عملیات بیشتر برای ${product.title}`}
                  aria-haspopup="menu"
                  aria-expanded={isKebabOpen}
                  title="عملیات بیشتر"
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                      onToggleKebab();
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
                      className="kebab-menu-item"
                      onClick={() => {
                        onCloseKebab();
                        onRefresh();
                      }}
                      disabled={busyAction !== null || product.enabled_target_count === 0}
                      title={
                        product.enabled_target_count === 0
                          ? "محصول هدف فعالی ندارد"
                          : "استعلام آنلاین و فوری قیمت این کالا"
                      }
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
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      <span>استعلام فوری قیمت</span>
                    </button>

                    {product.primary_target?.url && (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          className="kebab-menu-item"
                          onClick={() => {
                            onCloseKebab();
                            onCopyUrl(product.primary_target!.url);
                          }}
                          title="کپی آدرس منبع قیمت‌گیری در کلیپ‌بورد"
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
                          <span>{copiedKey === product.key ? "کپی شد!" : "کپی لینک منبع"}</span>
                        </button>

                        <a
                          href={product.primary_target.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          role="menuitem"
                          className="kebab-menu-item"
                          onClick={onCloseKebab}
                          title="مشاهده صفحه منبع در تب جدید"
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
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          <span>مشاهده در تب جدید</span>
                        </a>
                      </>
                    )}

                    <div className="kebab-menu-divider" role="separator" />

                    <button
                      type="button"
                      role="menuitem"
                      className="kebab-menu-item danger"
                      onClick={() => {
                        onCloseKebab();
                        onDelete();
                      }}
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
          ) : (
            <span className="muted-text">-</span>
          )}
        </div>
      </td>
    </tr>
  );
}
