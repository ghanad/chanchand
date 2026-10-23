"use client";

import React, { useEffect, useState, useCallback } from "react";
import { SourceRow } from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import { formatNumber } from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { Metric } from "../common/Metric";
import { PanelHead } from "../common/PanelHead";
import { Modal } from "../common/Modal";

interface SourceFormState {
  key: string;
  adapter: string;
  rate_limit_seconds: number;
  timeout_seconds: number;
  currency: string;
  price_multiplier: number;
}

const initialFormState: SourceFormState = {
  key: "",
  adapter: "digikala_api",
  rate_limit_seconds: 2,
  timeout_seconds: 15,
  currency: "IRR",
  price_multiplier: 1,
};

export function SourcesView() {
  const { isAdmin, setLoading, showToast, refreshTick, triggerRefresh } = useDashboard();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSource, setEditingSource] = useState<SourceRow | null>(null);

  const [form, setForm] = useState<SourceFormState>(initialFormState);
  const [editForm, setEditForm] = useState<SourceFormState>(initialFormState);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await requestJson<{ sources: SourceRow[] }>("/api/sources");
      setSources(payload.sources);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت لیست منابع");
    } finally {
      setLoading(false);
    }
  }, [setLoading, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  const totalSources = sources.length;
  const uniqueAdapters = new Set(sources.map((s) => s.adapter)).size;
  const totalTargets = sources.reduce((sum, s) => sum + (s.target_count || 0), 0);
  const activeTargets = sources.reduce((sum, s) => sum + (s.enabled_target_count || 0), 0);
  const avgRateLimit = totalSources > 0
    ? (sources.reduce((sum, s) => sum + (s.rate_limit_seconds || 0), 0) / totalSources).toFixed(1)
    : "0";

  function handleOpenEdit(source: SourceRow) {
    setEditingSource(source);
    setEditForm({
      key: source.key,
      adapter: source.adapter,
      rate_limit_seconds: source.rate_limit_seconds ?? 2,
      timeout_seconds: source.timeout_seconds ?? 15,
      currency: source.currency ?? "IRR",
      price_multiplier: source.price_multiplier ?? 1,
    });
  }

  async function handleAddSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;
    setBusyAction("add");
    try {
      const result = await requestJson<{ source_key: string }>("/api/admin/sources", {
        method: "POST",
        body: JSON.stringify({
          key: form.key.trim(),
          adapter: form.adapter,
          rate_limit_seconds: Number(form.rate_limit_seconds),
          timeout_seconds: Number(form.timeout_seconds),
          currency: form.currency,
          price_multiplier: Number(form.price_multiplier),
        }),
      });
      showToast(`منبع «${result.source_key}» با موفقیت افزوده شد.`);
      setForm(initialFormState);
      setShowAddModal(false);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در افزودن منبع");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !editingSource) return;
    setBusyAction(`edit:${editingSource.key}`);
    try {
      const result = await requestJson<{ source_key: string }>(
        `/api/admin/sources/${encodeURIComponent(editingSource.key)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            adapter: editForm.adapter,
            rate_limit_seconds: Number(editForm.rate_limit_seconds),
            timeout_seconds: Number(editForm.timeout_seconds),
            currency: editForm.currency,
            price_multiplier: Number(editForm.price_multiplier),
          }),
        }
      );
      showToast(`تنظیمات منبع «${result.source_key}» ذخیره شد.`);
      setEditingSource(null);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در ویرایش منبع");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteSource(source: SourceRow) {
    if (!isAdmin || !source.key) return;

    if (source.target_count && source.target_count > 0) {
      alert(`امکان حذف منبع «${source.key}» وجود ندارد زیرا در ${source.target_count} هدف قیمت‌گیری متصل است.`);
      return;
    }

    const confirmed = window.confirm(`آیا از حذف منبع «${source.key}» اطمینان دارید؟`);
    if (!confirmed) return;

    setBusyAction(`delete:${source.key}`);
    try {
      await requestJson(`/api/admin/sources/${encodeURIComponent(source.key)}`, {
        method: "DELETE",
      });
      showToast(`منبع «${source.key}» حذف شد.`);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در حذف منبع");
    } finally {
      setBusyAction(null);
    }
  }

  function getMonogram(key: string): string {
    if (key.startsWith("digikala")) return "DK";
    if (key.startsWith("brsapi")) return "BR";
    if (key.startsWith("generic")) return "GH";
    return key.slice(0, 2).toUpperCase();
  }

  function getBadgeClass(adapter: string): string {
    if (adapter.includes("digikala")) return "digikala_api";
    if (adapter.includes("brsapi")) return "brsapi_market";
    if (adapter.includes("generic")) return "generic_html";
    return "default";
  }

  return (
    <div className="sources-page page-stack">
      <section className="product-summary-grid" aria-label="خلاصه آمار منابع">
        <Metric label="کل منابع قیمت‌گیری" value={formatNumber(totalSources)} />
        <Metric label="آداپتورهای فعال" value={formatNumber(uniqueAdapters)} />
        <Metric
          label="هدف‌های متصل (فعال)"
          value={`${formatNumber(activeTargets)} / ${formatNumber(totalTargets)}`}
        />
        <Metric label="میانگین نرخ وقفه" value={`${avgRateLimit} ثانیه`} />
      </section>

      <section className="panel">
        <PanelHead
          title="فهرست منابع قیمت‌گیری"
          meta={`${formatNumber(totalSources)} منبع پیکربندی‌شده`}
          action={
            isAdmin ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => setShowAddModal(true)}
              >
                + افزودن منبع جدید
              </button>
            ) : null
          }
        />

        <div className="sources-grid">
          {sources.map((source) => {
            const isDeleting = busyAction === `delete:${source.key}`;
            const targetCount = source.target_count || 0;
            const enabledTargets = source.enabled_target_count || 0;
            const productCount = source.product_count || 0;

            return (
              <article className="source-card" key={source.key}>
                <div className="source-card-header">
                  <div className="source-title-group">
                    <span className="source-icon-badge">{getMonogram(source.key)}</span>
                    <strong title={source.key}>{source.key}</strong>
                  </div>
                  <span className={`adapter-badge ${getBadgeClass(source.adapter)}`}>
                    {source.adapter}
                  </span>
                </div>

                <div className="source-card-stats">
                  <span className="stat-label">وضعیت استفاده:</span>
                  {targetCount > 0 ? (
                    <span className="stat-val">
                      {formatNumber(enabledTargets)} هدف فعال در {formatNumber(productCount)} محصول
                    </span>
                  ) : (
                    <span className="stat-val" style={{ color: "var(--muted)" }}>
                      بدون هدف متصل
                    </span>
                  )}
                </div>

                <div className="source-params-grid">
                  <div className="source-param-item">
                    <span className="param-title">محدودیت نرخ (Rate Limit)</span>
                    <span className="param-value">
                      {source.rate_limit_seconds !== undefined ? `${source.rate_limit_seconds}s` : "-"}
                    </span>
                  </div>
                  <div className="source-param-item">
                    <span className="param-title">مهلت زمانی (Timeout)</span>
                    <span className="param-value">
                      {source.timeout_seconds !== undefined ? `${source.timeout_seconds}s` : "-"}
                    </span>
                  </div>
                  <div className="source-param-item">
                    <span className="param-title">واحد پولی</span>
                    <span className="param-value">{source.currency || "IRR"}</span>
                  </div>
                  <div className="source-param-item">
                    <span className="param-title">ضریب تبدیل</span>
                    <span className="param-value">
                      {source.price_multiplier !== undefined ? `× ${source.price_multiplier}` : "× 1"}
                    </span>
                  </div>
                </div>

                {isAdmin && (
                  <div className="source-card-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => handleOpenEdit(source)}
                      disabled={busyAction !== null}
                    >
                      ویرایش
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => handleDeleteSource(source)}
                      disabled={isDeleting || busyAction !== null}
                    >
                      {isDeleting ? "در حال حذف..." : "حذف"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* Developer note (subtle collapsible accordion) */}
      <details className="source-guide-accordion">
        <summary>
          <span className="guide-summary-icon">💡</span>
          <span>راهنمای توسعه‌دهندگان: افزودن آداپتور جدید به سیستم</span>
        </summary>
        <div className="source-guide-content">
          <p>
            هر <strong>منبع قیمت‌گیری (Source)</strong> برای واکشی داده‌های وب‌سایت مقصد از یک <strong>آداپتور (Adapter)</strong> استفاده می‌کند. اگر وب‌سایت موردنظرتان در فهرست آداپتورهای آماده بالا نیست، پیش از ساخت منبع باید آداپتور آن در سورس‌کد پیاده شود:
          </p>
          <ol>
            <li>
              <strong>پیاده‌سازی آداپتور:</strong> کلاسی در مسیر <code>src/lib/adapters/yourSite.ts</code> بسازید که از اینترفیس <code>PriceAdapter</code> پیروی کرده و متد <code>fetch</code> را پیاده کند.
            </li>
            <li>
              <strong>ثبت در رجیستری:</strong> نام آداپتور را در نگاشت <code>adapters</code> در فایل <code>src/lib/adapters/index.ts</code> ثبت کنید.
            </li>
            <li>
              <strong>اعتبارسنجی اسکیما:</strong> شناسه آداپتور را در <code>SourceConfigSchema</code> در فایل <code>src/lib/config.ts</code> مجاز کنید.
            </li>
          </ol>
          <p className="guide-note-muted">
            نکته: برای فروشگاه‌های عمومی که با سلکتور CSS کار می‌کنند، نیازی به نوشتن کد جدید نیست و می‌توانید از آداپتور آماده <code>generic_html</code> استفاده کنید.
          </p>
        </div>
      </details>

      {/* Modal: Add Source */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="افزودن منبع قیمت‌گیری جدید"
        maxWidth="600px"
      >
        <form className="modal-form" onSubmit={handleAddSource}>
          <div className="modal-grid-2">
            <label>
              شناسه منبع (Key)
              <input
                value={form.key}
                onChange={(e) => setForm((c) => ({ ...c, key: e.target.value }))}
                placeholder="مثلاً: digikala_app"
                dir="ltr"
                required
                autoFocus
              />
              <span className="form-hint">نام انگلیسی یکتا برای شناسایی منبع در سیستم</span>
            </label>
            <label>
              نوع آداپتور
              <select
                value={form.adapter}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((c) => ({
                    ...c,
                    adapter: val,
                    currency: val === "brsapi_market" ? "TOMAN" : c.currency,
                    price_multiplier: val === "brsapi_market" ? 10 : c.price_multiplier,
                  }));
                }}
              >
                <option value="digikala_api">digikala_api (وب‌سرویس دیجی‌کالا)</option>
                <option value="digikala_web">digikala_web (خزش وب دیجی‌کالا)</option>
                <option value="brsapi_market">brsapi_market (وب‌سرویس طلا و ارز)</option>
                <option value="generic_html">generic_html (خزش عمومی HTML)</option>
              </select>
              <span className="form-hint">موتور دریافت قیمت (در صورت نیاز به آداپتور اختصاصی جدید، به راهنمای پایین صفحه مراجعه کنید)</span>
            </label>
          </div>
          <div className="modal-grid-2">
            <label>
              فاصله بین درخواست‌ها (ثانیه)
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={form.rate_limit_seconds}
                onChange={(e) => setForm((c) => ({ ...c, rate_limit_seconds: Number(e.target.value) }))}
                required
              />
              <span className="form-hint">وقفه بین درخواست‌های متوالی برای جلوگیری از مسدودی</span>
            </label>
            <label>
              مهلت زمانی (Timeout ثانیه)
              <input
                type="number"
                min="1"
                value={form.timeout_seconds}
                onChange={(e) => setForm((c) => ({ ...c, timeout_seconds: Number(e.target.value) }))}
                required
              />
              <span className="form-hint">حداکثر زمان انتظار برای دریافت پاسخ از سرور</span>
            </label>
          </div>
          <div className="modal-grid-2">
            <label>
              واحد پول منبع
              <select
                value={form.currency}
                onChange={(e) => {
                  const curr = e.target.value;
                  setForm((c) => ({
                    ...c,
                    currency: curr,
                    price_multiplier: curr === "TOMAN" ? 10 : 1,
                  }));
                }}
              >
                <option value="IRR">IRR (ریال)</option>
                <option value="TOMAN">TOMAN (تومان)</option>
              </select>
              <span className="form-hint">واحد پولی که قیمت با آن از سایت دریافت می‌شود</span>
            </label>
            <label>
              ضریب تبدیل به ریال
              <input
                type="number"
                min="1"
                value={form.price_multiplier}
                onChange={(e) => setForm((c) => ({ ...c, price_multiplier: Number(e.target.value) }))}
                required
              />
              <span className="form-hint">برای ریال عدد ۱ و برای تومان عدد ۱۰ وارد شود</span>
            </label>
          </div>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowAddModal(false)}
              disabled={busyAction === "add"}
            >
              انصراف
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={busyAction === "add"}
            >
              {busyAction === "add" ? "در حال ثبت..." : "افزودن منبع"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Source */}
      <Modal
        isOpen={editingSource !== null}
        onClose={() => setEditingSource(null)}
        title={`ویرایش منبع: ${editingSource?.key || ""}`}
        maxWidth="600px"
      >
        <form className="modal-form" onSubmit={handleUpdateSource}>
          <div className="modal-grid-2">
            <label>
              شناسه منبع (غیرقابل ویرایش)
              <input
                value={editForm.key}
                disabled
                dir="ltr"
                style={{ backgroundColor: "var(--surface-soft)", cursor: "not-allowed" }}
              />
            </label>
            <label>
              نوع آداپتور
              <select
                value={editForm.adapter}
                onChange={(e) => setEditForm((c) => ({ ...c, adapter: e.target.value }))}
              >
                <option value="digikala_api">digikala_api (وب‌سرویس دیجی‌کالا)</option>
                <option value="digikala_web">digikala_web (خزش وب دیجی‌کالا)</option>
                <option value="brsapi_market">brsapi_market (وب‌سرویس طلا و ارز)</option>
                <option value="generic_html">generic_html (خزش عمومی HTML)</option>
              </select>
            </label>
          </div>
          <div className="modal-grid-2">
            <label>
              فاصله بین درخواست‌ها (ثانیه)
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={editForm.rate_limit_seconds}
                onChange={(e) => setEditForm((c) => ({ ...c, rate_limit_seconds: Number(e.target.value) }))}
                required
              />
            </label>
            <label>
              مهلت زمانی (Timeout ثانیه)
              <input
                type="number"
                min="1"
                value={editForm.timeout_seconds}
                onChange={(e) => setEditForm((c) => ({ ...c, timeout_seconds: Number(e.target.value) }))}
                required
              />
            </label>
          </div>
          <div className="modal-grid-2">
            <label>
              واحد پول منبع
              <select
                value={editForm.currency}
                onChange={(e) => setEditForm((c) => ({ ...c, currency: e.target.value }))}
              >
                <option value="IRR">IRR (ریال)</option>
                <option value="TOMAN">TOMAN (تومان)</option>
              </select>
            </label>
            <label>
              ضریب تبدیل به ریال
              <input
                type="number"
                min="1"
                value={editForm.price_multiplier}
                onChange={(e) => setEditForm((c) => ({ ...c, price_multiplier: Number(e.target.value) }))}
                required
              />
            </label>
          </div>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setEditingSource(null)}
              disabled={busyAction?.startsWith("edit:")}
            >
              انصراف
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={busyAction?.startsWith("edit:")}
            >
              {busyAction?.startsWith("edit:") ? "در حال ذخیره..." : "ذخیره تغییرات"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
