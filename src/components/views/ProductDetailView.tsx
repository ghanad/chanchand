"use client";

import React from "react";
import Link from "next/link";
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
  useProductDetailState,
} from "./product-detail";

interface ProductDetailViewProps {
  productKey: string;
}

export function ProductDetailView({ productKey }: ProductDetailViewProps) {
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
    isPublicProduct,
    showUsd,
    metricConfig,
    chartRows,
    isActive,
    configuredSources,
  } = useProductDetailState(productKey);

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
