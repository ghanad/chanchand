import React, { useState } from "react";
import { ProductRow } from "../../../types/dashboard";
import { requestJson } from "../../../lib/api-client";
import { ProductFormState } from "./types";

interface UseProductActionsProps {
  isAdmin: boolean;
  currentUser: any;
  showToast: (msg: string) => void;
  triggerRefresh: () => void;
  setProducts: React.Dispatch<React.SetStateAction<ProductRow[]>>;
}

export function useProductActions({
  isAdmin,
  currentUser,
  showToast,
  triggerRefresh,
  setProducts,
}: UseProductActionsProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [togglingKeys, setTogglingKeys] = useState<Record<string, boolean>>({});

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
    active_start_hour: 0,
    active_end_hour: 23,
  });
  const [editProductKey, setEditProductKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProductFormState>({
    title: "",
    url: "",
    source_key: "",
    is_public: false,
    show_usd_chart: false,
    active_start_hour: 0,
    active_end_hour: 23,
  });

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
          adapter_settings:
            form.adapter_settings ||
            (form.source_key === "iranjib" ? { item_name: form.title.trim() } : undefined),
        }),
      });
      showToast(`محصول ${result.product_key} اضافه شد.`);
      setForm((current) => ({
        title: "",
        url: "",
        source_key: current.source_key,
        is_public: false,
        show_usd_chart: false,
        active_start_hour: 0,
        active_end_hour: 23,
        adapter_settings: undefined,
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
      active_start_hour: product.active_start_hour ?? 0,
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
      active_start_hour: 0,
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

  const handleRefreshProduct = async (product: ProductRow) => {
    if (busyAction !== null || product.can_refresh === false) return;
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
    busyAction,
    togglingKeys,
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
    handleOpenAddModal,
    addProduct,
    startEditProduct,
    cancelEditProduct,
    updateProduct,
    handleToggleProduct,
    handleConfirmDelete,
    handleRefreshProduct,
  };
}
