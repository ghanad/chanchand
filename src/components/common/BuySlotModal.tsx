"use client";

import React, { useState } from "react";
import { Modal } from "./Modal";
import { useDashboard } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";
import { formatNumber } from "@/lib/formatters";

interface BuySlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function BuySlotModal({ isOpen, onClose, onSuccess }: BuySlotModalProps) {
  const { currentUser, showToast, triggerRefresh, refreshCurrentUser } = useDashboard();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const balance = currentUser?.wallet_balance ?? 0;
  const slotPrice = currentUser?.slot_price ?? 50000;
  const currentTotal = currentUser?.quota?.totalLimit ?? 3;
  const currentUsed = currentUser?.quota?.usedCount ?? 0;
  const hasEnoughBalance = balance >= slotPrice;
  const deficit = slotPrice - balance;

  async function handleBuy() {
    if (!hasEnoughBalance || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await requestJson<{ success: boolean; message: string }>("/api/user/wallet/buy-slot", {
        method: "POST",
      });
      showToast(res.message || "ظرفیت جدید با موفقیت فعال شد.");
      await refreshCurrentUser();
      triggerRefresh();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "خطا در خرید اسلات");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="شارژ ماهانه ظرفیت پایش محصول" maxWidth="480px">
      <div className="space-y-4">
        {/* خلاصه وضعیت و ظرفیت */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
          <div className="flex justify-between items-center py-1">
            <span className="text-[var(--text-muted)]">ظرفیت فعلی شما:</span>
            <span className="font-semibold">{formatNumber(currentTotal)} محصول ({formatNumber(currentUsed)} در حال استفاده)</span>
          </div>
          <div className="flex justify-between items-center py-1 border-t border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)]">تعرفه شارژ ماهانه هر اسلات (۳۰ روزه):</span>
            <span className="font-bold text-[var(--primary)]">{formatNumber(slotPrice)} تومان</span>
          </div>
          <div className="flex justify-between items-center py-1 border-t border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)]">موجودی کیف پول شما:</span>
            <span className={`font-bold ${hasEnoughBalance ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
              {formatNumber(balance)} تومان
            </span>
          </div>
        </div>

        {hasEnoughBalance ? (
          <div className="text-sm text-[var(--text-muted)] leading-relaxed">
            با کلیک روی دکمه زیر، مبلغ <strong>{formatNumber(slotPrice)} تومان</strong> از کیف پول شما کسر و ۱ اسلات پایش با اعتبار ۳۰ روزه به حساب شما اضافه می‌شود.
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-amber-300">
              <span>⚠️</span>
              <span>موجودی کیف پول شما کافی نیست</span>
            </div>
            <p className="leading-relaxed">
              برای شارژ ماهانه اسلات، نیاز به <strong>{formatNumber(deficit)} تومان</strong> شارژ بیشتر دارید.
            </p>
            <p className="leading-relaxed text-[var(--text-muted)]">
              💡 جهت افزایش موجودی کیف پول خود، با مدیریت سامانه تماس بگیرید تا حسابتان به صورت دستی شارژ شود.
            </p>
          </div>
        )}

        {/* دکمه‌های عملیات */}
        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            انصراف
          </button>
          {hasEnoughBalance && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleBuy}
              disabled={isSubmitting}
            >
              {isSubmitting ? "در حال ثبت..." : "تأیید و شارژ ماهانه (+۱)"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
