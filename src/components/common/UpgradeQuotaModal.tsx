"use client";

import React, { useEffect, useState } from "react";
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
  const { currentUser, showToast } = useDashboard();
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [purchasingPkgId, setPurchasingPkgId] = useState<number | null>(null);

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
        {/* پیام دوستانه و توضیح محدودیت سهمیه */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs space-y-2">
          <div className="font-bold flex items-center gap-2 text-amber-300 text-sm">
            <span>⚡</span>
            <span>سقف مجاز محصولات تکمیل شده است</span>
          </div>
          <p className="text-[var(--foreground)] leading-relaxed">
            شما در حال حاضر از تمام سهمیه پایش خود (<strong>{formatNumber(usedCount)} از {formatNumber(totalLimit)} محصول</strong>) استفاده کرده‌اید.
            برای افزودن محصول جدید، می‌توانید یکی از بسته‌های زیر را تهیه کنید. ظرفیت‌های خریداری‌شده <strong>دائمی</strong> بوده و هرگز منقضی نمی‌شوند.
          </p>
        </div>

        {/* لیست بسته‌ها */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-[var(--text-muted)]">
            بسته‌های افزایش ظرفیت:
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">
              در حال بارگذاری بسته‌ها...
            </div>
          ) : packages.length === 0 ? (
            <div className="p-4 text-center text-xs text-[var(--text-muted)] rounded-lg bg-[var(--surface-muted)]">
              هیچ بسته‌ای در حال حاضر فعال نیست.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {packages.map((pkg) => {
                const isBuying = purchasingPkgId === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] hover:border-[var(--primary)] transition-colors gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--foreground)]">
                          {pkg.title}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          +{formatNumber(pkg.slots)} محصول
                        </span>
                      </div>
                      {pkg.description && (
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          {pkg.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border-subtle)]">
                      <div className="text-left sm:text-right">
                        <span className="text-sm font-bold text-[var(--primary)]">
                          {formatNumber(pkg.price_toman)}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] mr-1">تومان</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 whitespace-nowrap"
                        disabled={purchasingPkgId !== null}
                        onClick={() => handleBuyPackage(pkg)}
                      >
                        {isBuying ? (
                          <span>در حال اتصال...</span>
                        ) : (
                          <>
                            <span>خرید و پرداخت</span>
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
        <div className="flex justify-end pt-3 border-t border-[var(--border)]">
          <button
            type="button"
            className="btn btn-secondary text-xs"
            onClick={onClose}
            disabled={purchasingPkgId !== null}
          >
            بستن
          </button>
        </div>
      </div>
    </Modal>
  );
}
