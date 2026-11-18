"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ProductSlotInfo } from "@/lib/types";
import { formatDateOnly, formatNumber } from "@/lib/formatters";
import { requestJson } from "@/lib/api-client";
import { useDashboard } from "@/context/DashboardContext";

interface WalletSlotsPanelProps {
  slots: ProductSlotInfo[];
  onChanged: () => Promise<void> | void;
}

/**
 * Per-product slot windows. This is the table that answers "which products are
 * being monitored, until when, and which ones have run out?".
 */
export function WalletSlotsPanel({ slots, onChanged }: WalletSlotsPanelProps) {
  const { showToast, refreshCurrentUser, triggerRefresh } = useDashboard();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [transferFrom, setTransferFrom] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState("");

  // Only products whose window has lapsed can receive a transferred window.
  const transferTargets = slots.filter((s) => s.kind === "expired");

  async function handleTransfer(fromKey: string) {
    if (!transferTo || busyKey) return;
    setBusyKey(fromKey);
    try {
      await requestJson(`/api/products/${encodeURIComponent(fromKey)}/transfer`, {
        method: "POST",
        body: JSON.stringify({ to_key: transferTo }),
      });
      showToast("پنجره پایش به محصول مقصد منتقل شد.");
      setTransferFrom(null);
      setTransferTo("");
      await refreshCurrentUser();
      triggerRefresh();
      await onChanged();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در انتقال اسلات");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRenew(productKey: string) {
    if (busyKey) return;
    setBusyKey(productKey);
    try {
      await requestJson(`/api/products/${encodeURIComponent(productKey)}/renew`, { method: "POST" });
      showToast("پنجره پایش این محصول برای ۳۰ روز دیگر فعال شد.");
      await refreshCurrentUser();
      triggerRefresh();
      await onChanged();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در تمدید اسلات این محصول");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="wallet-slots-panel" aria-label="وضعیت اسلات هر محصول">
      <div className="wallet-tx-panel-header">
        <div className="wallet-section-titles">
          <h2>
            <span aria-hidden="true">🗂️</span>
            <span>اسلات هر محصول</span>
          </h2>
          <p>هر محصول پولی ۳۰ روز از لحظه افزودن پایش می‌شود؛ سه محصول اول همیشه رایگان‌اند.</p>
        </div>
      </div>

      {slots.length === 0 ? (
        <div className="wallet-slots-empty">هنوز محصولی اضافه نکرده‌اید.</div>
      ) : (
        <div className="wallet-table-wrap">
          <table className="wallet-table" aria-label="جدول اسلات محصولات">
            <thead>
              <tr>
                <th scope="col">محصول</th>
                <th scope="col">نوع اسلات</th>
                <th scope="col">شروع پایش</th>
                <th scope="col">پایان پایش</th>
                <th scope="col">وضعیت</th>
                <th scope="col">اقدام</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.product_key}>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={`/products/${encodeURIComponent(slot.product_key)}`} className="wallet-slot-link">
                      {slot.title}
                    </Link>
                  </td>
                  <td style={{ color: "var(--muted)" }}>
                    {slot.kind === "free" ? "رایگان (دائمی)" : "پولی (۳۰ روزه)"}
                  </td>
                  <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {slot.kind === "free" ? "—" : formatDateOnly(slot.started_at)}
                  </td>
                  <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {slot.kind === "free" ? "—" : formatDateOnly(slot.expires_at)}
                  </td>
                  <td>
                    <span
                      className="status-pill"
                      style={{
                        background:
                          slot.kind === "paid"
                            ? "rgba(19, 118, 79, 0.1)"
                            : slot.kind === "expired"
                            ? "rgba(180, 59, 59, 0.1)"
                            : "rgba(120, 120, 120, 0.08)",
                        color:
                          slot.kind === "paid"
                            ? "var(--ok)"
                            : slot.kind === "expired"
                            ? "var(--danger)"
                            : "var(--muted)",
                        border: `1px solid ${
                          slot.kind === "paid"
                            ? "rgba(19, 118, 79, 0.25)"
                            : slot.kind === "expired"
                            ? "rgba(180, 59, 59, 0.25)"
                            : "rgba(120, 120, 120, 0.18)"
                        }`,
                      }}
                    >
                      {slot.kind === "paid"
                        ? `${formatNumber(slot.days_remaining ?? 0)} روز مانده`
                        : slot.kind === "expired"
                        ? "منقضی شده"
                        : "فعال"}
                    </span>
                  </td>
                  <td>
                    {slot.kind === "expired" ? (
                      <button
                        type="button"
                        className="wallet-slot-renew-btn"
                        onClick={() => handleRenew(slot.product_key)}
                        disabled={busyKey !== null}
                      >
                        {busyKey === slot.product_key ? "در حال تمدید..." : "تمدید ۳۰ روزه"}
                      </button>
                    ) : slot.kind === "paid" && !slot.transferred_at ? (
                      transferFrom === slot.product_key ? (
                        <div className="wallet-slot-transfer">
                          <select
                            value={transferTo}
                            onChange={(e) => setTransferTo(e.target.value)}
                            disabled={busyKey !== null}
                            aria-label="محصول مقصد انتقال"
                          >
                            <option value="">محصول مقصد…</option>
                            {transferTargets.map((target) => (
                              <option key={target.product_key} value={target.product_key}>
                                {target.title}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="wallet-slot-renew-btn"
                            onClick={() => handleTransfer(slot.product_key)}
                            disabled={!transferTo || busyKey !== null}
                          >
                            تأیید
                          </button>
                          <button
                            type="button"
                            className="wallet-slot-cancel-btn"
                            onClick={() => {
                              setTransferFrom(null);
                              setTransferTo("");
                            }}
                            disabled={busyKey !== null}
                          >
                            انصراف
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="wallet-slot-transfer-btn"
                          onClick={() => {
                            setTransferFrom(slot.product_key);
                            setTransferTo("");
                          }}
                          disabled={transferTargets.length === 0 || busyKey !== null}
                          title={
                            transferTargets.length === 0
                              ? "محصول منقضی‌شده‌ای برای انتقال وجود ندارد."
                              : "روزهای باقی‌مانده این اسلات را یک‌بار به محصول دیگری منتقل کنید."
                          }
                        >
                          انتقال
                        </button>
                      )
                    ) : (
                      <span className="muted-text">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
