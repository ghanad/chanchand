"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "./Modal";
import { useDashboard } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";
import { formatNumber } from "@/lib/formatters";
import { PackageRow } from "@/lib/types";

interface UpgradeQuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UpgradeQuotaModal({ isOpen, onClose }: UpgradeQuotaModalProps) {
  const { currentUser, showToast, refreshCurrentUser, triggerRefresh } = useDashboard();
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [purchasingPkgId, setPurchasingPkgId] = useState<number | null>(null);
  const [buyingSlot, setBuyingSlot] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);

    requestJson<{ packages: PackageRow[] }>("/api/packages")
      .then((data) => {
        if (isMounted) setPackages(data.packages || []);
      })
      .catch((err) => {
        if (isMounted) {
          showToast(err instanceof Error ? err.message : "خطا در دریافت بسته‌ها");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, showToast]);

  const quota = currentUser?.quota;
  const usedCount = quota?.usedCount ?? 0;
  const totalLimit = quota?.totalLimit ?? 3;
  const balance = currentUser?.wallet_balance ?? 0;
  const slotPrice = currentUser?.slot_price ?? 50000;
  const hasEnoughBalance = balance >= slotPrice;
  const deficit = slotPrice - balance;

  async function handleBuySlot() {
    if (!hasEnoughBalance || buyingSlot) return;
    setBuyingSlot(true);
    try {
      const res = await requestJson<{ success: boolean; message: string }>("/api/user/wallet/buy-slot", {
        method: "POST",
      });
      showToast(res.message || "یک اسلات جدید با موفقیت فعال شد.");
      await refreshCurrentUser();
      triggerRefresh();
      onClose();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در خرید اسلات محصول");
    } finally {
      setBuyingSlot(false);
    }
  }

  async function handleBuyPackage(pkg: PackageRow) {
    if (purchasingPkgId !== null) return;
    setPurchasingPkgId(pkg.id);
    try {
      const res = await requestJson<{
        success: boolean;
        gatewayUrl: string;
        authority: string;
      }>("/api/payments/request", {
        method: "POST",
        body: JSON.stringify({ packageId: pkg.id }),
      });

      if (res.gatewayUrl) {
        showToast("در حال انتقال به درگاه پرداخت...");
        window.location.assign(res.gatewayUrl);
      }
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در اتصال به درگاه پرداخت");
      setPurchasingPkgId(null);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ارتقای ظرفیت پایش محصول" maxWidth="560px">
      <div className="space-y-4">
        {/* پیام محدودیت سهمیه */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs space-y-2">
          <div className="font-bold flex items-center gap-2 text-amber-500 dark:text-amber-300 text-sm">
            <span>⚡</span>
            <span>سقف مجاز محصولات تکمیل شده است</span>
          </div>
          <p className="text-[var(--foreground)] leading-relaxed">
            شما در حال حاضر از تمام سهمیه پایش خود (<strong>{formatNumber(usedCount)} از {formatNumber(totalLimit)} محصول</strong>) استفاده کرده‌اید.
            برای افزودن محصول جدید، می‌توانید ظرفیت جدید تهیه کنید یا کیف پول خود را شارژ نمایید.
          </p>
        </div>

        {/* موجودی فعلی کیف پول و وضعیت اسلات */}
        <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-[var(--text-muted)] font-medium">موجودی فعلی کیف پول:</span>
            <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400" dir="ltr">
              {formatNumber(balance)} تومان
            </span>
          </div>

          <div className="flex justify-between items-center text-xs pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)]">هزینه هر اسلات محصول:</span>
            <span className="font-bold text-xs text-[var(--foreground)]" dir="ltr">
              {formatNumber(slotPrice)} تومان
            </span>
          </div>

          {/* اکشن اصلی بر اساس موجودی */}
          <div className="pt-2">
            {hasEnoughBalance ? (
              <button
                type="button"
                className="btn btn-primary w-full text-xs py-2.5 font-bold flex items-center justify-center gap-2"
                onClick={handleBuySlot}
                disabled={buyingSlot}
              >
                {buyingSlot ? (
                  <span>در حال فعال‌سازی اسلات...</span>
                ) : (
                  <>
                    <span>خرید ۱ اسلات با موجودی کیف پول ({formatNumber(slotPrice)} تومان)</span>
                    <span aria-hidden="true">⚡</span>
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] text-amber-600 dark:text-amber-400">
                  موجودی کیف پول شما کافی نیست (کسری: {formatNumber(deficit)} تومان).
                </div>
                <Link
                  href="/account/wallet?focus=topup"
                  onClick={onClose}
                  className="btn btn-primary w-full text-xs py-2.5 font-bold flex items-center justify-center gap-2 text-center"
                >
                  <span>شارژ کیف پول و خرید اسلات</span>
                  <span aria-hidden="true">💳</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* لیست بسته‌های افزایش ظرفیت */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-muted)]">
            <span>بسته‌های افزایش ظرفیت (پرداخت آنلاین):</span>
            <Link
              href="/account/wallet"
              onClick={onClose}
              className="text-[var(--primary)] hover:underline"
            >
              مدیریت کامل در کیف پول ←
            </Link>
          </div>

          {loading ? (
            <div className="p-6 text-center text-xs text-[var(--text-muted)]">
              در حال بارگذاری بسته‌ها...
            </div>
          ) : packages.length === 0 ? (
            <div className="p-3 text-center text-xs text-[var(--text-muted)] rounded-lg bg-[var(--surface-muted)]">
              هیچ بسته‌ای در حال حاضر فعال نیست.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
              {packages.map((pkg) => {
                const isBuying = purchasingPkgId === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] hover:border-[var(--primary)] transition-colors gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[var(--foreground)]">
                          {pkg.title}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                          +{formatNumber(pkg.slots)} محصول
                        </span>
                      </div>
                      {pkg.description && (
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          {pkg.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border-subtle)]">
                      <div className="text-left sm:text-right">
                        <span className="text-xs font-bold text-[var(--primary)]">
                          {formatNumber(pkg.price_toman)}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] mr-1">تومان</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 whitespace-nowrap"
                        disabled={purchasingPkgId !== null}
                        onClick={() => handleBuyPackage(pkg)}
                      >
                        {isBuying ? (
                          <span>اتصال...</span>
                        ) : (
                          <>
                            <span>خرید مستقیم</span>
                            <span aria-hidden="true">💳</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* دکمه انصراف */}
        <div className="flex justify-between items-center pt-3 border-t border-[var(--border)]">
          <Link
            href="/account/wallet"
            onClick={onClose}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)]"
          >
            مشاهده کیف پول و تراکنش‌ها
          </Link>
          <button
            type="button"
            className="btn btn-secondary text-xs"
            onClick={onClose}
            disabled={purchasingPkgId !== null || buyingSlot}
          >
            بستن
          </button>
        </div>
      </div>
    </Modal>
  );
}
