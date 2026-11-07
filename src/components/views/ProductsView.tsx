"use client";

import React from "react";
import Link from "next/link";
import { formatNumber } from "../../lib/formatters";
import { PanelHead } from "../common/PanelHead";
import { UpgradeQuotaModal } from "../common/UpgradeQuotaModal";

import { ProductsToolbar } from "./products/ProductsToolbar";
import { ProductsTable } from "./products/ProductsTable";
import { AddProductModal } from "./products/AddProductModal";
import { EditProductModal } from "./products/EditProductModal";
import { DeleteProductModal } from "./products/DeleteProductModal";
import { useProductsState } from "./products/useProductsState";

export function ProductsView() {
  const {
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
  } = useProductsState();

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
                onClick={handleOpenAddModal}
              >
                + افزودن محصول
              </button>
            }
          />

          {currentUser && currentUser.role !== "admin" && currentUser.quota?.isExpired && (
            <div
              className="quota-expired-banner"
              style={{
                margin: "12px 16px",
                padding: "12px 16px",
                borderRadius: "8px",
                background: "rgba(180, 59, 59, 0.08)",
                border: "1px solid rgba(180, 59, 59, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                fontSize: "12.5px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--danger)" }}>
                <span aria-hidden="true" style={{ fontSize: "16px" }}>⚠️</span>
                <span>
                  <strong>اشتراک ماهانه ظرفیت شما منقضی شده است.</strong> پایش محصولات مازاد متوقف شده است. جهت ادامه پایش خودکار، اشتراک خود را تمدید فرمایید.
                </span>
              </div>
              <Link
                href="/account/wallet"
                className="btn btn-primary btn-sm"
                style={{ whiteSpace: "nowrap" }}
              >
                تمدید / شارژ اشتراک
              </Link>
            </div>
          )}

          {/* Search & Filter Toolbar */}
          <ProductsToolbar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            allCount={configuredProductCount}
            personalCount={personalProducts.length}
            publicCount={publicProducts.length}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortChange={handleDirectSort}
          />

          {/* Compact Product Table */}
          <ProductsTable
            configProducts={configProducts}
            personalProducts={personalProducts}
            filteredPersonal={filteredPersonal}
            filteredPublic={filteredPublic}
            allFilteredCount={allFilteredCount}
            activeTab={activeTab}
            isAdmin={isAdmin}
            basePath={basePath}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            renderSortIndicator={renderSortIndicator}
            togglingKeys={togglingKeys}
            activeKebabKey={activeKebabKey}
            busyAction={busyAction}
            copiedKey={copiedKey}
            kebabTriggerRefs={kebabTriggerRefs}
            setActiveKebabKey={setActiveKebabKey}
            onOpenAddModal={handleOpenAddModal}
            onStartEdit={startEditProduct}
            onToggleProduct={handleToggleProduct}
            onRefreshProduct={handleRefreshProduct}
            onSelectProductToDelete={setProductToDelete}
            onCopyUrl={copyToClipboard}
          />
        </section>
      </div>

      {/* Modal: Add Product */}
      <AddProductModal
        isOpen={showAddProductModal}
        onClose={() => setShowAddProductModal(false)}
        onSubmit={addProduct}
        form={form}
        setForm={setForm}
        sources={configuredSources}
        isAdmin={isAdmin}
        isBusy={busyAction === "add"}
      />

      {/* Modal: Upgrade Quota */}
      <UpgradeQuotaModal
        isOpen={showBuySlotModal}
        onClose={() => setShowBuySlotModal(false)}
      />

      {/* Modal: Edit Product */}
      <EditProductModal
        isOpen={editProductKey !== null}
        productKey={editProductKey}
        onClose={cancelEditProduct}
        onSubmit={updateProduct}
        editForm={editForm}
        setEditForm={setEditForm}
        sources={configuredSources}
        isAdmin={isAdmin}
        isBusy={busyAction === `edit:${editProductKey}`}
      />

      {/* Modal: Delete Confirmation Dialog */}
      <DeleteProductModal
        product={productToDelete}
        onClose={() => setProductToDelete(null)}
        onConfirm={handleConfirmDelete}
        isBusy={busyAction === `delete:${productToDelete?.key}`}
      />
    </div>
  );
}
