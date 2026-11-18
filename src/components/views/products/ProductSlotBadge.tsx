"use client";

import React, { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";

interface ProductSlotBadgeProps {
  productKey: string;
  slotExpiresAt?: string | null;
  isAdmin: boolean;
  isPublic?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Shows how long this product keeps being monitored: a permanent free slot, a
 * paid window with days left, or a lapsed window that can be renewed with a
 * purchased credit. This is the per-product answer to "how much of my slot is
 * left?" that the old shared pool could not give.
 */
export function ProductSlotBadge({ productKey, slotExpiresAt, isAdmin, isPublic }: ProductSlotBadgeProps) {
  const { showToast, refreshCurrentUser, triggerRefresh } = useDashboard();
  const [busy, setBusy] = useState(false);
  // Sample the clock once per mount so render stays pure.
  const [nowMs] = useState(() => Date.now());

  // Catalog products cost no quota, so they have no slot window to show.
  if (isAdmin || isPublic) return null;

  if (!slotExpiresAt) {
    return (
      <span className="slot-badge slot-badge-free" title="این محصول روی یکی از ۳ اسلات رایگان دائمی شماست.">
        اسلات رایگان
      </span>
    );
  }

  const remainingMs = new Date(slotExpiresAt).getTime() - nowMs;

  if (remainingMs > 0) {
    const days = Math.max(1, Math.ceil(remainingMs / DAY_MS));
    return (
      <span
        className="slot-badge slot-badge-paid"
        title={`پایش این محصول تا ${new Date(slotExpiresAt).toLocaleDateString("fa-IR")} ادامه دارد.`}
      >
        {days.toLocaleString("fa-IR")} روز مانده
      </span>
    );
  }

  async function handleRenew(event: React.MouseEvent) {
    event.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await requestJson(`/api/products/${encodeURIComponent(productKey)}/renew`, { method: "POST" });
      showToast("پنجره پایش این محصول برای ۳۰ روز دیگر فعال شد.");
      await refreshCurrentUser();
      triggerRefresh();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در تمدید اسلات این محصول");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="slot-badge slot-badge-expired"
      onClick={handleRenew}
      disabled={busy}
      title="پنجره پایش این محصول تمام شده و قیمت‌ها ثبت نمی‌شوند. برای فعال‌سازی ۳۰ روزه کلیک کنید."
    >
      {busy ? "در حال تمدید..." : "منقضی — تمدید"}
    </button>
  );
}
