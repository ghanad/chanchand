"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";
import { formatNumber, formatDate } from "@/lib/formatters";
import { PanelHead } from "@/components/common/PanelHead";
import { Metric } from "@/components/common/Metric";
import { EmptyState } from "@/components/common/EmptyState";
import { PackageRow, PaymentTransactionRow, WalletTransactionRow } from "@/lib/types";

interface WalletData {
  wallet_balance: number;
  extra_slots: number;
  slot_price: number;
  quota: {
    freeLimit: number;
    extraSlots: number;
    totalLimit: number;
    usedCount: number;
    remaining: number;
    canAdd: boolean;
  };
  transactions: WalletTransactionRow[];
}

function WalletContent() {
  const searchParams = useSearchParams();
  const { currentUser, showToast, refreshCurrentUser, triggerRefresh } = useDashboard();

  const topupCardRef = useRef<HTMLDivElement>(null);

  // Data states
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Action states
  const [purchasingPkgId, setPurchasingPkgId] = useState<number | null>(null);
  const [buyingSlot, setBuyingSlot] = useState(false);
  const [activeTxTab, setActiveTxTab] = useState<"wallet" | "payments">("wallet");

  // Focus top-up card if query param focus=topup
  useEffect(() => {
    if (searchParams.get("focus") === "topup" && topupCardRef.current) {
      topupCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      topupCardRef.current.focus();
    }
  }, [searchParams]);

  // Load wallet data
  const loadWallet = useCallback(async () => {
    try {
      const data = await requestJson<WalletData>("/api/user/wallet");
      setWalletData(data);
    } catch {
      // Ignore background load error
    }
  }, []);

  // Load packages
  const loadPackages = useCallback(async () => {
    try {
      const data = await requestJson<{ packages: PackageRow[] }>("/api/packages");
      setPackages(data.packages || []);
    } catch {
      // Ignore background load error
    }
  }, []);

  // Load payment transactions
  const loadPaymentTransactions = useCallback(async () => {
    try {
      const data = await requestJson<{ transactions: PaymentTransactionRow[] }>("/api/payments");
      setPaymentTransactions(data.transactions || []);
    } catch {
      // Ignore background load error
    }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([loadWallet(), loadPackages(), loadPaymentTransactions()]).finally(() => {
      setLoading(false);
    });
  }, [loadWallet, loadPackages, loadPaymentTransactions]);

  if (!currentUser) return null;

  const balance = walletData?.wallet_balance ?? currentUser.wallet_balance ?? 0;
  const extraSlots = walletData?.extra_slots ?? currentUser.extra_slots ?? 0;
  const slotPrice = walletData?.slot_price ?? currentUser.slot_price ?? 50000;
  const quota = walletData?.quota ?? currentUser.quota ?? {
    freeLimit: 3,
    extraSlots,
    totalLimit: 3 + extraSlots,
    usedCount: 0,
    remaining: 3,
    canAdd: true,
  };

  const freeQuotaUsed = Math.min(quota.usedCount, 3);
  const extraQuotaUsed = Math.max(0, quota.usedCount - 3);
  const usedPercentage = Math.min(
    100,
    Math.round((quota.usedCount / Math.max(1, quota.totalLimit)) * 100)
  );

  const canAffordSlot = balance >= slotPrice;
  const walletTransactions = walletData?.transactions || [];

  // Handle buying single slot from wallet balance
  async function handleBuySlotFromWallet() {
    if (!canAffordSlot || buyingSlot) return;
    setBuyingSlot(true);
    try {
      const res = await requestJson<{ success: boolean; message: string }>("/api/user/wallet/buy-slot", {
        method: "POST",
      });
      showToast(res.message || "یک اسلات جدید با موفقیت فعال شد.");
      await refreshCurrentUser();
      triggerRefresh();
      await loadWallet();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در خرید اسلات محصول");
    } finally {
      setBuyingSlot(false);
    }
  }

  // Handle buying package via payment gateway
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
        showToast("در حال انتقال به درگاه پرداخت امن بانکی...");
        window.location.assign(res.gatewayUrl);
      }
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در ایجاد درخواست پرداخت");
      setPurchasingPkgId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ۱. بالای صفحه: موجودی کیف پول و فرم/کارت شارژ */}
      <section className="product-summary-grid" aria-label="خلاصه موجودی و سهمیه">
        <Metric
          label="موجودی کیف پول"
          value={`${formatNumber(balance)} تومان`}
        />
        <Metric
          label="سهمیه پایه رایگان"
          value={`${formatNumber(freeQuotaUsed)} از ۳ محصول`}
        />
        <Metric
          label="اسلات‌های اضافه"
          value={
            currentUser.role === "admin"
              ? "نامحدود"
              : `${formatNumber(extraSlots)} اسلات (+${formatNumber(extraQuotaUsed)} استفاده)`
          }
        />
        <Metric
          label="کل ظرفیت باقی‌مانده"
          value={
            currentUser.role === "admin"
              ? "نامحدود"
              : `${formatNumber(quota.remaining)} محصول`
          }
        />
      </section>

      {/* کارت شارژ کیف پول و افزایش اعتبار */}
      <div
        ref={topupCardRef}
        id="topup-card"
        tabIndex={-1}
        className="panel p-5 space-y-4 focus:ring-2 focus:ring-[var(--primary)] outline-none transition-shadow"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <span>💳</span>
              <span>شارژ کیف پول و مدیریت اعتبار</span>
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              موجودی کیف پول برای خرید اسلات پایش محصول استفاده می‌شود.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[var(--surface-muted)] p-2.5 px-4 rounded-xl border border-[var(--border)]">
            <span className="text-xs text-[var(--text-muted)] font-medium">موجودی فعلی شما:</span>
            <span className="text-base font-black text-emerald-600 dark:text-emerald-400" dir="ltr">
              {formatNumber(balance)} تومان
            </span>
          </div>
        </div>

        {/* راهنما و روش‌های شارژ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/10 text-xs text-sky-900 dark:text-sky-200 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-sky-800 dark:text-sky-300">
              <span>⚡</span>
              <span>خرید بسته‌های اعتباری و اسلات پایش</span>
            </div>
            <p className="leading-relaxed">
              شما می‌توانید با انتخاب یکی از بسته‌های افزایش ظرفیت در بخش زیر، هزینه آن را مستقیماً از طریق درگاه امن پرداخت بانکی بپردازید تا اسلات‌ها بلافاصله به حسابتان افزوده شوند.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-900 dark:text-emerald-200 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
              <span>🛡️</span>
              <span>شارژ مستقیم کیف پول</span>
            </div>
            <p className="leading-relaxed">
              همچنین می‌توانید جهت شارژ کیف پول خود یا مبالغ دلخواه، با پشتیبانی مدیریت چن‌چند در ارتباط باشید تا پس از هماهنگی، کیف پول شما به صورت آنی شارژ شود.
            </p>
          </div>
        </div>
      </div>

      {/* ۲. بخش میانی: وضعیت سهمیه و گزینه‌های خرید ظرفیت اضافی */}
      <div className="space-y-4">
        <PanelHead
          title="افزایش ظرفیت پایش محصول"
          meta={`هزینه هر اسلات: ${formatNumber(slotPrice)} تومان`}
        />

        {/* نوار وضعیت مصرف سهمیه */}
        <div className="panel p-5 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-[var(--text-muted)]">میزان مصرف ظرفیت پایش:</span>
            <span className="font-bold text-[var(--foreground)]">
              {currentUser.role === "admin"
                ? "کاربر مدیر — بدون محدودیت سهمیه"
                : `${formatNumber(quota.usedCount)} از ${formatNumber(quota.totalLimit)} محصول (${formatNumber(usedPercentage)}٪)`}
            </span>
          </div>

          {currentUser.role !== "admin" && (
            <div className="w-full bg-[var(--surface-muted)] h-2.5 rounded-full overflow-hidden border border-[var(--border)]">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  usedPercentage >= 100 ? "bg-amber-500" : "bg-[var(--primary)]"
                }`}
                style={{ width: `${usedPercentage}%` }}
              />
            </div>
          )}

          <div className="text-xs text-[var(--text-muted)] space-y-1 pt-1">
            <p>• پایش ۳ محصول اول برای تمام کاربران <strong>رایگان</strong> است.</p>
            <p>• تمام ظرفیت‌های خریداری‌شده <strong>دائمی</strong> هستند و هرگز منقضی نمی‌شوند.</p>
            <p>• با حذف هر محصول، ظرفیت آن آزاد شده و بلافاصله می‌توانید کالای دیگری را پایش کنید.</p>
          </div>

          {/* خرید تکی اسلات از محل کیف پول */}
          {currentUser.role !== "admin" && (
            <div className="mt-4 pt-4 border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[var(--foreground)]">
                  خرید ۱ اسلات دائمی از محل موجودی کیف پول
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  مبلغ {formatNumber(slotPrice)} تومان از موجودی فعلی شما کسر خواهد شد.
                </div>
              </div>

              <button
                type="button"
                disabled={!canAffordSlot || buyingSlot}
                onClick={handleBuySlotFromWallet}
                className="btn btn-primary text-xs py-2 px-4 whitespace-nowrap font-bold flex items-center justify-center gap-1.5"
              >
                {buyingSlot ? (
                  "در حال ثبت..."
                ) : canAffordSlot ? (
                  <>
                    <span>خرید ۱ اسلات با موجودی کیف پول</span>
                    <span aria-hidden="true">⚡</span>
                  </>
                ) : (
                  `موجودی ناکافی (کسری: ${formatNumber(slotPrice - balance)} تومان)`
                )}
              </button>
            </div>
          )}
        </div>

        {/* لیست بسته‌های افزایش ظرفیت آنلاین */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-[var(--text-muted)]">
            بسته‌های ارتقای ظرفیت پایش (پرداخت مستقیم آنلاین):
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-[var(--text-muted)]">
              در حال بارگذاری بسته‌های موجود...
            </div>
          ) : packages.length === 0 ? (
            <EmptyState text="در حال حاضر هیچ بسته‌ای برای خرید فعال نیست." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {packages.map((pkg) => {
                const isBuying = purchasingPkgId === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    className="panel p-5 flex flex-col justify-between hover:border-[var(--primary)] transition-all relative overflow-hidden"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-base text-[var(--foreground)]">
                          {pkg.title}
                        </h3>
                        <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                          +{formatNumber(pkg.slots)} محصول
                        </span>
                      </div>

                      {pkg.description && (
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-4">
                          {pkg.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-4 border-t border-[var(--border)] space-y-3">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-[var(--text-muted)]">مبلغ پرداختی:</span>
                        <div>
                          <span className="text-xl font-black text-[var(--primary)]">
                            {formatNumber(pkg.price_toman)}
                          </span>
                          <span className="text-xs text-[var(--text-muted)] mr-1">تومان</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={purchasingPkgId !== null}
                        onClick={() => handleBuyPackage(pkg)}
                        className="btn btn-primary w-full text-xs py-2.5 flex items-center justify-center gap-2 font-bold"
                      >
                        {isBuying ? (
                          <span>در حال انتقال به درگاه...</span>
                        ) : (
                          <>
                            <span>خرید و پرداخت آنلاین</span>
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
      </div>

      {/* ۳. بخش پایین: جدول تراکنش‌ها */}
      <section className="panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <PanelHead
            title="تاریخچه تراکنش‌ها"
            meta="گزارش تراکنش‌های کیف پول و پرداخت‌های آنلاین"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTxTab("wallet")}
              className={`text-xs py-1.5 px-3 rounded-lg font-medium transition-colors ${
                activeTxTab === "wallet"
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              گردش کیف پول ({formatNumber(walletTransactions.length)})
            </button>
            <button
              type="button"
              onClick={() => setActiveTxTab("payments")}
              className={`text-xs py-1.5 px-3 rounded-lg font-medium transition-colors ${
                activeTxTab === "payments"
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              پرداخت‌های بانکی ({formatNumber(paymentTransactions.length)})
            </button>
          </div>
        </div>

        {/* جدول تراکنش‌های کیف پول */}
        {activeTxTab === "wallet" && (
          walletTransactions.length === 0 ? (
            <EmptyState text="هنوز هیچ تراکنشی در کیف پول شما ثبت نشده است." />
          ) : (
            <div className="product-table-wrap overflow-x-auto">
              <table className="product-compact-table" aria-label="جدول تراکنش‌های کیف پول">
                <thead>
                  <tr>
                    <th scope="col">نوع تراکنش</th>
                    <th scope="col">مبلغ</th>
                    <th scope="col">موجودی پس از تراکنش</th>
                    <th scope="col">توضیحات</th>
                    <th scope="col">تاریخ و ساعت</th>
                  </tr>
                </thead>
                <tbody>
                  {walletTransactions.map((tx) => {
                    const isPositive = tx.amount > 0;
                    return (
                      <tr key={tx.id} className="product-table-row">
                        <td>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium ${
                              isPositive
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {tx.type === "admin_charge"
                              ? "شارژ دستی توسط مدیر"
                              : tx.type === "slot_purchase"
                              ? "خرید اسلات محصول"
                              : "تعدیل موجودی"}
                          </span>
                        </td>
                        <td className="font-bold text-xs" dir="ltr">
                          <span className={isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                            {isPositive ? "+" : ""}
                            {formatNumber(tx.amount)} تومان
                          </span>
                        </td>
                        <td className="text-xs" dir="ltr">
                          {formatNumber(tx.balance_after)} تومان
                        </td>
                        <td className="text-xs text-[var(--text-muted)]">
                          {tx.description || "-"}
                        </td>
                        <td className="text-xs text-[var(--text-muted)]">
                          {formatDate(tx.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* جدول پرداخت‌های درگاه */}
        {activeTxTab === "payments" && (
          paymentTransactions.length === 0 ? (
            <EmptyState text="هنوز هیچ تراکنش پرداختی ثبت نشده است." />
          ) : (
            <div className="product-table-wrap overflow-x-auto">
              <table className="product-compact-table" aria-label="جدول تراکنش‌های پرداخت">
                <thead>
                  <tr>
                    <th scope="col">بسته / شرح</th>
                    <th scope="col">تعداد اسلات</th>
                    <th scope="col">مبلغ</th>
                    <th scope="col">درگاه</th>
                    <th scope="col">وضعیت</th>
                    <th scope="col">کد پیگیری</th>
                    <th scope="col">تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentTransactions.map((tx) => (
                    <tr key={tx.id} className="product-table-row">
                      <td className="font-semibold text-xs text-[var(--foreground)]">
                        {tx.package_title}
                      </td>
                      <td className="text-xs font-medium">
                        +{formatNumber(tx.slots)}
                      </td>
                      <td className="text-xs font-bold" dir="ltr">
                        {formatNumber(tx.amount_toman)} تومان
                      </td>
                      <td className="text-xs text-[var(--text-muted)]">
                        {tx.gateway === "zarinpal" ? "زرین‌پال" : tx.gateway === "mock" ? "آزمایشی" : tx.gateway}
                      </td>
                      <td>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded font-semibold ${
                            tx.status === "paid"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : tx.status === "pending"
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                              : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {tx.status === "paid"
                            ? "پرداخت موفق"
                            : tx.status === "pending"
                            ? "در انتظار پرداخت"
                            : "ناموفق / لغو شده"}
                        </span>
                      </td>
                      <td className="text-xs font-mono text-[var(--text-muted)]" dir="ltr">
                        {tx.ref_id || "-"}
                      </td>
                      <td className="text-xs text-[var(--text-muted)]">
                        {formatDate(tx.paid_at || tx.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  );
}

export default function AccountWalletPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-[var(--text-muted)]">در حال بارگذاری اطلاعات کیف پول...</div>}>
      <WalletContent />
    </Suspense>
  );
}
