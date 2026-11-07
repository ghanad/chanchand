import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ProductRow, SourceRow, ProductsPayload, PriceRow, LatestPayload } from "../../../types/dashboard";
import { requestJson } from "../../../lib/api-client";
import { useDashboard } from "../../../context/DashboardContext";
import {
  ProductItemWithPrice,
  SortField,
  SortDirection,
  ProductTab,
  ProductFormState,
} from "./types";

export function useProductsState() {
  const { isAdmin, currentUser, setLoading, showToast, refreshTick, triggerRefresh } = useDashboard();
  const basePath = isAdmin ? "/admin" : "";
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [latestPrices, setLatestPrices] = useState<PriceRow[]>([]);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Modals state
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showBuySlotModal, setShowBuySlotModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<ProductRow | null>(null);

  // Forms state
  const [form, setForm] = useState<ProductFormState>({
    title: "",
    url: "",
    source_key: "",
    is_public: false,
    show_usd_chart: false,
    active_start_hour: 8,
    active_end_hour: 23,
  });
  const [editProductKey, setEditProductKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProductFormState>({
    title: "",
    url: "",
    source_key: "",
    is_public: false,
    show_usd_chart: false,
    active_start_hour: 8,
    active_end_hour: 23,
  });

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

  function handleDirectSort(field: SortField | null, direction: SortDirection = "asc") {
    setSortField(field);
    setSortDirection(direction);
  }

  const handleOpenAddModal = () => {
    if (!isAdmin && currentUser?.quota && !currentUser.quota.canAdd) {
      setShowBuySlotModal(true);
    } else {
      setShowAddProductModal(true);
    }
  };

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
          show_usd_chart: isAdmin && form.is_public ? form.show_usd_chart : false,
          active_start_hour: isAdmin ? form.active_start_hour : undefined,
          active_end_hour: isAdmin ? form.active_end_hour : undefined,
        }),
      });
      showToast(`محصول ${result.product_key} اضافه شد.`);
      setForm((current) => ({
        title: "",
        url: "",
        source_key: current.source_key,
        is_public: false,
        show_usd_chart: false,
        active_start_hour: 8,
        active_end_hour: 23,
      }));
      setShowAddProductModal(false);
      triggerRefresh();
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : "خطا در افزودن محصول";
      if (errMsg.includes("ظرفیت") || error?.quota_exceeded || error?.code === "QUOTA_EXCEEDED") {
        setShowAddProductModal(false);
        setShowBuySlotModal(true);
      } else {
        showToast(errMsg);
      }
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
      show_usd_chart: Boolean(product.show_usd_chart),
      active_start_hour: product.active_start_hour ?? 8,
      active_end_hour: product.active_end_hour ?? 23,
    });
  }

  function cancelEditProduct() {
    setEditProductKey(null);
    setEditForm({
      title: "",
      url: "",
      source_key: "",
      is_public: false,
      show_usd_chart: false,
      active_start_hour: 8,
      active_end_hour: 23,
    });
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
            show_usd_chart: isAdmin ? (editForm.is_public ? editForm.show_usd_chart : false) : undefined,
            active_start_hour: isAdmin ? editForm.active_start_hour : undefined,
            active_end_hour: isAdmin ? editForm.active_end_hour : undefined,
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
      await requestJson<{ product_key: string }>(endpoint, { method: "POST" });
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

  return {
    isAdmin,
    currentUser,
    basePath,
    busyAction,
    configuredSources,
    configProducts,
    configuredProductCount,
    personalProducts,
    publicProducts,
    filteredPersonal,
    filteredPublic,
    allFilteredCount,
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    sortField,
    sortDirection,
    handleSort,
    handleDirectSort,
    renderSortIndicator,
    showAddProductModal,
    setShowAddProductModal,
    showBuySlotModal,
    setShowBuySlotModal,
    productToDelete,
    setProductToDelete,
    form,
    setForm,
    editProductKey,
    editForm,
    setEditForm,
    copiedKey,
    togglingKeys,
    activeKebabKey,
    setActiveKebabKey,
    kebabTriggerRefs,
    handleOpenAddModal,
    addProduct,
    startEditProduct,
    cancelEditProduct,
    updateProduct,
    handleToggleProduct,
    handleConfirmDelete,
    copyToClipboard,
    handleRefreshProduct,
  };
}
