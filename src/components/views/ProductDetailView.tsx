"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNumber } from "@/lib/formatters";
import { PanelHead } from "@/components/common/PanelHead";
import { EmptyState } from "@/components/common/EmptyState";
import { HistoryTable } from "@/components/tables/HistoryTable";
import {
  ProductDetailHeader,
  ProductDetailSummary,
  ProductDetailChart,
  ProductDetailEditModal,
  ProductDetailDeleteModal,
  ProductDetailColorModal,
  useProductDetailState,
} from "./product-detail";
import { useDashboard } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";

interface ProductDetailViewProps {
  productKey: string;
}

export function ProductDetailView({ productKey }: ProductDetailViewProps) {
  const router = useRouter();
  const { showToast } = useDashboard();
  const [showColorModal, setShowColorModal] = useState(false);
  const [isSavingColor, setIsSavingColor] = useState(false);

  const {
    isAdmin,
    basePath,
    product,
    history,
    isInitialLoading,
    copiedUrl,
    isToggling,
    showEditModal,
    setShowEditModal,
    showDeleteModal,
    setShowDeleteModal,
    isRunningNow,
    editForm,
    setEditForm,
    isSavingEdit,
    isDeleting,
    activeMetric,
    chartMetric,
    setChartMetric,
    historyLimit,
    setHistoryLimit,
    handleCopyUrl,
    handleToggleActive,
    handleRunNow,
    handleUpdateProduct,
    handleDeleteProduct,
    latestSnapshot,
    minToman,
    maxToman,
    minUsd,
    maxUsd,
    minGold,
    maxGold,
    isPublicProduct,
    showUsd,
    showGold,
    metricConfig,
    chartRows,
    isActive,
    configuredSources,
  } = useProductDetailState(productKey);

  async function handleChangeColor(colorId: string | null, colorLabel: string | null) {
    setIsSavingColor(true);
    try {
      const result = await requestJson<{ product_key: string }>(
        `/api/products/${encodeURIComponent(productKey)}/color`,
        {
          method: "POST",
          body: JSON.stringify({ color_id: colorId, color_label: colorLabel }),
        }
      );
      setShowColorModal(false);
      if (result.product_key !== productKey) {
        showToast(`رنگ محصول تغییر کرد (${result.product_key}).`);
        router.push(`${basePath}/products/${result.product_key}`);
      } else {
        showToast("رنگ محصول به‌روزرسانی شد.");
      }
    } catch (error: any) {
      showToast(error instanceof Error ? error.message : "خطا در تغییر رنگ محصول");
    } finally {
      setIsSavingColor(false);
    }
  }

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
        onChangeColor={() => setShowColorModal(true)}
      />

      <ProductDetailSummary
        latestSnapshot={latestSnapshot}
        isPublicProduct={isPublicProduct}
        showUsd={showUsd}
        minToman={minToman}
        maxToman={maxToman}
        minUsd={minUsd}
        maxUsd={maxUsd}
        minGold={minGold}
        maxGold={maxGold}
        showGold={showGold}
        historyLength={history.length}
      />

      <ProductDetailChart
        chartRows={chartRows}
        isPublicProduct={isPublicProduct}
        showUsdToggle={showUsd}
        showGoldToggle={showGold}
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
          productKey={product.key}
          productTitle={product.title}
          form={editForm}
          setForm={setEditForm}
          configuredSources={configuredSources}
          isAdmin={isAdmin}
          isSaving={isSavingEdit}
        />
      )}

      {/* Modal: Change colour */}
      {product.primary_target ? (
        <ProductDetailColorModal
          isOpen={showColorModal}
          onClose={() => setShowColorModal(false)}
          productUrl={product.primary_target.url}
          currentColorId={product.primary_target.color_id ?? null}
          onConfirm={handleChangeColor}
          isSaving={isSavingColor}
        />
      ) : null}

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
