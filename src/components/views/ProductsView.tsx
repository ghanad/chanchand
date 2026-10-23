"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ProductRow, SourceRow, ProductsPayload } from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import { formatNumber } from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { Metric } from "../common/Metric";
import { PanelHead } from "../common/PanelHead";
import { StatusPill } from "../common/StatusPill";

export function ProductsView() {
  const { isAdmin, setLoading, showToast, refreshTick, triggerRefresh } = useDashboard();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [form, setForm] = useState({ title: "", url: "", source_key: "" });
  const [editProductKey, setEditProductKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", url: "", source_key: "" });

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

  const configuredSources = sources.filter((source) => source.configured);
  const activeTargetCount = products.reduce((total, p) => total + p.enabled_target_count, 0);
  const targetCount = products.reduce((total, p) => total + p.target_count, 0);
  const activeProducts = products.filter((p) => p.enabled_target_count > 0).length;
  const configProducts = products.filter((p) => p.configured);
  const configuredProductCount = configProducts.length;

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

  async function disableProduct(productKey: string) {
    if (!isAdmin || !productKey) return;
    setBusyAction(`disable:${productKey}`);
    try {
      const result = await requestJson<{ product_key: string }>(
        `/admin/config/products/${encodeURIComponent(productKey)}/disable`,
        { method: "POST" },
      );
      showToast(`محصول ${result.product_key} غیرفعال شد.`);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در غیرفعال‌سازی");
    } finally {
      setBusyAction(null);
    }
  }

  async function enableProduct(productKey: string) {
    if (!isAdmin || !productKey) return;
    setBusyAction(`enable:${productKey}`);
    try {
      const result = await requestJson<{ product_key: string }>(
        `/admin/config/products/${encodeURIComponent(productKey)}/enable`,
        { method: "POST" },
      );
      showToast(`محصول ${result.product_key} فعال شد.`);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در فعال‌سازی");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteProduct(product: ProductRow) {
    if (!isAdmin || !product.key) return;
    const confirmed = window.confirm(`محصول «${product.title}» از config حذف شود؟`);
    if (!confirmed) return;

    setBusyAction(`delete:${product.key}`);
    try {
      const result = await requestJson<{ product_key: string }>(
        `/admin/config/products/${encodeURIComponent(product.key)}`,
        { method: "DELETE" },
      );
      showToast(`محصول ${result.product_key} حذف شد.`);
      if (editProductKey === product.key) {
        cancelEditProduct();
      }
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در حذف محصول");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="products-page">
      <section className="product-summary-grid" aria-label="خلاصه محصولات">
        <Metric label="کل محصول‌ها" value={formatNumber(configuredProductCount)} />
        <Metric label="محصول فعال" value={formatNumber(activeProducts)} />
        <Metric label="هدف‌های فعال" value={`${formatNumber(activeTargetCount)} / ${formatNumber(targetCount)}`} />
        <Metric label="منبع‌های config" value={formatNumber(configuredSources.length)} />
      </section>

      <div className={`product-grid ${isAdmin ? "" : "read-only"}`}>
        {isAdmin ? (
          <section className="panel product-form-panel">
            <PanelHead title="افزودن محصول" />
            <form className="product-form" onSubmit={addProduct}>
              <label>
                عنوان
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                URL
                <input
                  value={form.url}
                  onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                  type="url"
                  required
                />
              </label>
              <label>
                منبع
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
              <button className="primary-button product-submit" type="submit" disabled={busyAction === "add"}>
                {busyAction === "add" ? "در حال افزودن" : "اضافه کردن"}
              </button>
            </form>
          </section>
        ) : null}

        <section className="panel product-list-panel">
          <PanelHead title="محصول‌های config" meta={`${formatNumber(configuredProductCount)} محصول`} />
          <div className="product-list">
            {configProducts.map((product) => {
              const isActive = product.enabled_target_count > 0;
              const canToggle = product.target_count > 0;
              const actionBusy = busyAction === `disable:${product.key}` || busyAction === `enable:${product.key}`;
              const editBusy = busyAction === `edit:${product.key}`;
              const deleteBusy = busyAction === `delete:${product.key}`;
              const canDelete = product.configured && configuredProductCount > 1;
              const isEditing = editProductKey === product.key;
              const status = product.target_count === 0 ? "بدون هدف" : isActive ? "فعال" : "غیرفعال";
              const statusTone = isActive ? "in_stock" : product.target_count === 0 ? "unknown" : "out_of_stock";

              return (
                <article className={`product-row ${isEditing ? "editing" : ""}`} key={product.key}>
                  {isEditing ? (
                    <form className="product-edit-form" onSubmit={updateProduct}>
                      <div className="product-title-row">
                        <strong>ویرایش محصول: {product.title}</strong>
                        <span className="product-key">{product.key}</span>
                      </div>
                      <div className="product-edit-fields">
                        <label>
                          عنوان
                          <input
                            value={editForm.title}
                            onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                            autoComplete="off"
                            required
                          />
                        </label>
                        <label>
                          منبع
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
                        <label className="full-width">
                          URL
                          <input
                            value={editForm.url}
                            onChange={(event) => setEditForm((current) => ({ ...current, url: event.target.value }))}
                            type="url"
                            required
                          />
                        </label>
                      </div>
                      <div className="product-edit-actions">
                        <button className="primary-button" type="submit" disabled={editBusy}>
                          {editBusy ? "در حال ذخیره" : "ذخیره"}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={cancelEditProduct}
                          disabled={editBusy}
                        >
                          انصراف
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="product-main">
                        <div className="product-title-row">
                          <strong>{product.title}</strong>
                          <StatusPill text={status} tone={statusTone} />
                        </div>
                        <span className="product-key">{product.key}</span>
                        {product.primary_target ? (
                          <span className="product-url">{product.primary_target.url}</span>
                        ) : null}
                        <div className="source-chip-row">
                          {product.sources.length ? (
                            product.sources.map((source) => (
                              <span className="source-chip" key={`${product.key}:${source}`}>
                                {source}
                              </span>
                            ))
                          ) : (
                            <span className="source-chip muted-chip">بدون منبع</span>
                          )}
                        </div>
                      </div>
                      <div className="product-meta">
                        <span>
                          {formatNumber(product.enabled_target_count)} / {formatNumber(product.target_count)} هدف فعال
                        </span>
                        {isAdmin ? (
                          <>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => startEditProduct(product)}
                              disabled={!product.primary_target || busyAction !== null}
                            >
                              ویرایش
                            </button>
                            <button
                              className={isActive ? "danger-button" : "secondary-button"}
                              type="button"
                              onClick={() => (isActive ? disableProduct(product.key) : enableProduct(product.key))}
                              disabled={!canToggle || actionBusy || busyAction === `delete:${product.key}`}
                            >
                              {actionBusy
                                ? isActive
                                  ? "در حال غیرفعال‌سازی"
                                  : "در حال فعال‌سازی"
                                : isActive
                                  ? "غیرفعال کردن"
                                  : canToggle
                                    ? "فعال کردن"
                                    : "بدون هدف"}
                            </button>
                            <button
                              className="danger-button"
                              type="button"
                              onClick={() => deleteProduct(product)}
                              disabled={!canDelete || deleteBusy || busyAction !== null}
                            >
                              {deleteBusy ? "در حال حذف" : "حذف"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
