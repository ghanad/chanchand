"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ProductRow, SourceRow, ProductsPayload } from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import { formatNumber } from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { Metric } from "../common/Metric";
import { PanelHead } from "../common/PanelHead";
import { StatusPill } from "../common/StatusPill";
import { Modal } from "../common/Modal";

export function ProductsView() {
  const { isAdmin, setLoading, showToast, refreshTick, triggerRefresh } = useDashboard();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);

  const [form, setForm] = useState({ title: "", url: "", source_key: "" });
  const [editProductKey, setEditProductKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", url: "", source_key: "" });

  const [sourceForm, setSourceForm] = useState({
    key: "",
    adapter: "digikala_api",
    rate_limit_seconds: 2,
    timeout_seconds: 15,
    currency: "IRR",
    price_multiplier: 1,
  });

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
    const confirmed = window.confirm(`محصول «${product.title}» حذف شود؟`);
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

  async function addSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;
    setBusyAction("add_source");
    try {
      const result = await requestJson<{ source_key: string }>("/api/admin/sources", {
        method: "POST",
        body: JSON.stringify({
          key: sourceForm.key.trim(),
          adapter: sourceForm.adapter,
          rate_limit_seconds: Number(sourceForm.rate_limit_seconds),
          timeout_seconds: Number(sourceForm.timeout_seconds),
          currency: sourceForm.currency,
          price_multiplier: Number(sourceForm.price_multiplier),
        }),
      });
      showToast(`منبع ${result.source_key} با موفقیت افزوده شد.`);
      setSourceForm({
        key: "",
        adapter: "digikala_api",
        rate_limit_seconds: 2,
        timeout_seconds: 15,
        currency: "IRR",
        price_multiplier: 1,
      });
      setShowAddSourceModal(false);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در افزودن منبع");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteSource(sourceKey: string) {
    if (!isAdmin || !sourceKey) return;
    const confirmed = window.confirm(`منبع «${sourceKey}» حذف شود؟`);
    if (!confirmed) return;

    setBusyAction(`delete_source:${sourceKey}`);
    try {
      await requestJson(`/api/admin/sources/${encodeURIComponent(sourceKey)}`, {
        method: "DELETE",
      });
      showToast(`منبع ${sourceKey} حذف شد.`);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در حذف منبع");
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
        <Metric label="منابع قیمت‌گیری" value={formatNumber(configuredSources.length)} />
      </section>

      <div className={`product-grid ${isAdmin ? "" : "read-only"}`}>
        <section className="panel product-list-panel">
          <PanelHead
            title="محصولات"
            meta={`${formatNumber(configuredProductCount)} محصول`}
            action={
              isAdmin ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setShowAddProductModal(true)}
                >
                  + افزودن محصول
                </button>
              ) : null
            }
          />
          <div className="product-list">
            {configProducts.map((product) => {
              const isActive = product.enabled_target_count > 0;
              const canToggle = product.target_count > 0;
              const actionBusy = busyAction === `disable:${product.key}` || busyAction === `enable:${product.key}`;
              const editBusy = busyAction === `edit:${product.key}`;
              const deleteBusy = busyAction === `delete:${product.key}`;
              const canDelete = product.configured;
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
                            dir="ltr"
                            placeholder="https://..."
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

      <section className="panel" style={{ marginTop: '1.5rem' }}>
        <PanelHead
          title="منابع قیمت‌گیری"
          meta={`${formatNumber(configuredSources.length)} منبع`}
          action={
            isAdmin ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => setShowAddSourceModal(true)}
              >
                + افزودن منبع
              </button>
            ) : null
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          {configuredSources.map((source) => (
            <div
              key={source.key}
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                backgroundColor: 'var(--card-bg, #ffffff)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '1rem' }}>{source.key}</strong>
                <span className="source-chip">{source.adapter}</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {source.rate_limit_seconds !== undefined ? `فاصله درخواست: ${source.rate_limit_seconds} ثانیه` : null}
                {source.currency ? ` | واحد: ${source.currency}` : null}
              </div>
              {isAdmin && (
                <div style={{ marginTop: 'auto', paddingTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="danger-button"
                    type="button"
                    style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                    onClick={() => deleteSource(source.key)}
                    disabled={busyAction === `delete_source:${source.key}`}
                  >
                    {busyAction === `delete_source:${source.key}` ? "در حال حذف" : "حذف منبع"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

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

      {/* Modal: Add Source */}
      <Modal
        isOpen={showAddSourceModal}
        onClose={() => setShowAddSourceModal(false)}
        title="افزودن منبع قیمت‌گیری جدید"
        maxWidth="600px"
      >
        <form className="modal-form" onSubmit={addSource}>
          <div className="modal-grid-2">
            <label>
              شناسه منبع (Key)
              <input
                value={sourceForm.key}
                onChange={(e) => setSourceForm((c) => ({ ...c, key: e.target.value }))}
                placeholder="مثلاً: digikala_market"
                dir="ltr"
                required
                autoFocus
              />
            </label>
            <label>
              نوع آداپتور
              <select
                value={sourceForm.adapter}
                onChange={(e) => setSourceForm((c) => ({ ...c, adapter: e.target.value }))}
              >
                <option value="digikala_api">digikala_api</option>
                <option value="digikala_web">digikala_web</option>
                <option value="generic_html">generic_html</option>
                <option value="brsapi_market">brsapi_market</option>
              </select>
            </label>
          </div>
          <div className="modal-grid-2">
            <label>
              محدودیت نرخ (ثانیه)
              <input
                type="number"
                min="0"
                step="0.5"
                value={sourceForm.rate_limit_seconds}
                onChange={(e) => setSourceForm((c) => ({ ...c, rate_limit_seconds: Number(e.target.value) }))}
              />
            </label>
            <label>
              مهلت زمانی (ثانیه)
              <input
                type="number"
                min="1"
                value={sourceForm.timeout_seconds}
                onChange={(e) => setSourceForm((c) => ({ ...c, timeout_seconds: Number(e.target.value) }))}
              />
            </label>
          </div>
          <div className="modal-grid-2">
            <label>
              واحد پول
              <select
                value={sourceForm.currency}
                onChange={(e) => setSourceForm((c) => ({ ...c, currency: e.target.value }))}
              >
                <option value="IRR">IRR (ریال)</option>
                <option value="TOMAN">TOMAN (تومان)</option>
              </select>
            </label>
            <label>
              ضریب ارز
              <input
                type="number"
                min="1"
                value={sourceForm.price_multiplier}
                onChange={(e) => setSourceForm((c) => ({ ...c, price_multiplier: Number(e.target.value) }))}
              />
            </label>
          </div>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowAddSourceModal(false)}
              disabled={busyAction === "add_source"}
            >
              انصراف
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={busyAction === "add_source"}
            >
              {busyAction === "add_source" ? "در حال افزودن..." : "ثبت منبع"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
