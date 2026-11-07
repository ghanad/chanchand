"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ProductRow,
  SourceRow,
  PriceRow,
  ProductsPayload,
  HistoryMetric,
} from "@/types/dashboard";
import { requestJson } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/formatters";
import { useDashboard } from "@/context/DashboardContext";
import { PanelHead } from "@/components/common/PanelHead";
import { EmptyState } from "@/components/common/EmptyState";
import { HistoryTable } from "@/components/tables/HistoryTable";
import {
  ProductDetailEditForm,
  ProductDetailHeader,
  ProductDetailSummary,
  ProductDetailChart,
  ProductDetailEditModal,
  ProductDetailDeleteModal,
} from "./product-detail";

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
  const [editForm, setEditForm] = useState<ProductDetailEditForm>({
    title: "",
    url: "",
    source_key: "",
    is_public: false,
    show_usd_chart: false,
    active_start_hour: 8,
    active_end_hour: 23,
  });
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
          show_usd_chart: Boolean(matched.show_usd_chart),
          active_start_hour: matched.active_start_hour ?? 8,
          active_end_hour: matched.active_end_hour ?? 23,
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
  const handleUpdateProduct = async (e: React.FormEvent<HTMLFormElement>) => {
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
            show_usd_chart: isAdmin ? (editForm.is_public ? editForm.show_usd_chart : false) : undefined,
            active_start_hour: isAdmin ? editForm.active_start_hour : undefined,
            active_end_hour: isAdmin ? editForm.active_end_hour : undefined,
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

  const isPublicProduct = Boolean(product?.is_public);
  const showUsd = !isPublicProduct || Boolean(product?.show_usd_chart);
  const activeMetric: HistoryMetric = showUsd ? chartMetric : "toman";

  const metricConfig = useMemo(() => {
    return activeMetric === "usd"
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
  }, [activeMetric]);

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
      <ProductDetailHeader
        product={product}
        latestSnapshot={latestSnapshot}
        isAdmin={isAdmin}
        basePath={basePath}
        isActive={isActive}
        copiedUrl={copiedUrl}
        isRunningNow={isRunningNow}
        isToggling={isToggling}
        onCopyUrl={handleCopyUrl}
        onRunNow={handleRunNow}
        onToggleActive={handleToggleActive}
        onOpenEdit={() => setShowEditModal(true)}
        onOpenDelete={() => setShowDeleteModal(true)}
      />

      <ProductDetailSummary
        latestSnapshot={latestSnapshot}
        isPublicProduct={isPublicProduct}
        showUsd={showUsd}
        minToman={minToman}
        maxToman={maxToman}
        minUsd={minUsd}
        maxUsd={maxUsd}
        historyLength={history.length}
      />

      <ProductDetailChart
        chartRows={chartRows}
        isPublicProduct={isPublicProduct}
        showUsdToggle={showUsd}
        activeMetric={activeMetric}
        setChartMetric={setChartMetric}
        historyLimit={historyLimit}
        setHistoryLimit={setHistoryLimit}
        metricConfig={metricConfig}
        productKey={productKey}
      />

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
        <ProductDetailEditModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSubmit={handleUpdateProduct}
          productTitle={product.title}
          form={editForm}
          setForm={setEditForm}
          configuredSources={configuredSources}
          isAdmin={isAdmin}
          isSaving={isSavingEdit}
        />
      )}

      {/* Modal: Delete Confirmation */}
      {(isAdmin || product.can_edit) && (
        <ProductDetailDeleteModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteProduct}
          productTitle={product.title}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
