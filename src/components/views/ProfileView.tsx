"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useDashboard } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";
import { formatNumber, formatDate } from "@/lib/formatters";
import { PanelHead } from "@/components/common/PanelHead";
import { Metric } from "@/components/common/Metric";
import { EmptyState } from "@/components/common/EmptyState";
import { BuySlotModal } from "@/components/common/BuySlotModal";

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
  transactions: Array<{
    id: number;
    user_id: number;
    amount: number;
    balance_after: number;
    type: string;
    description: string | null;
    created_at: string;
  }>;
}

export function ProfileView() {
  const { currentUser, showToast, refreshCurrentUser, refreshTick } = useDashboard();
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBuySlotModal, setShowBuySlotModal] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const data = await requestJson<WalletData>("/api/user/wallet");
      setWalletData(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "خطا در دریافت اطلاعات کیف پول");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet, refreshTick]);

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
  const transactions = walletData?.transactions ?? [];

  const usedPercentage = Math.min(
    100,
    Math.round((quota.usedCount / Math.max(1, quota.totalLimit)) * 100)
  );

  return (
    <div className="profile-page space-y-6 max-w-6xl mx-auto p-4 sm:p-6">
      {/* سربرگ مشخصات کاربر */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[var(--primary)] to-emerald-400 text-white flex items-center justify-center font-bold text-2xl shadow-md">
            {(currentUser.username?.[0] || "U").toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span>{currentUser.username}</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                currentUser.role === "admin"
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20"
              }`}>
                {currentUser.role === "admin" ? "مدیر کل" : "کاربر عادی"}
              </span>
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              {currentUser.email || "بدون ایمیل ثبت شده"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/change-password"
            className="btn btn-secondary text-xs flex items-center gap-1.5"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>تغییر کلمه عبور</span>
          </Link>
          <Link
            href="/products"
            className="btn btn-secondary text-xs flex items-center gap-1.5"
          >
            <span>بازگشت به محصولات</span>
            <span>←</span>
          </Link>
        </div>
      </div>

      {/* کارت‌های خلاصه آمار */}
      <section className="product-summary-grid" aria-label="خلاصه حساب و کیف پول">
        <Metric
          label="موجودی کیف پول"
          value={`${formatNumber(balance)} تومان`}
        />
        <Metric
          label="ظرفیت محصولات پایش‌شده"
          value={
            currentUser.role === "admin"
              ? "نامحدود"
              : `${formatNumber(quota.usedCount)} از ${formatNumber(quota.totalLimit)}`
          }
        />
        <Metric
          label="اسلات‌های اضافه خریداری‌شده"
          value={
            currentUser.role === "admin"
              ? "نامحدود"
              : `${formatNumber(extraSlots)} اسلات`
          }
        />
        <Metric
          label="تعداد تراکنش‌های ثبت‌شده"
          value={formatNumber(transactions.length)}
        />
      </section>

      {/* دو ستون اصلی: مدیریت اسلات و راهنمای شارژ کیف پول */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ستون ۱: سهمیه و افزایش ظرفیت محصول */}
        <div className="panel p-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span>⚡</span>
                  <span>ظرفیت پایش محصول (Product Slots)</span>
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  پایش ۳ محصول اول برای همه رایگان است. هر اسلات اضافه به شما امکان می‌دهد یک محصول جدید را پایش کنید.
                </p>
              </div>
              <span className="text-xs font-bold px-2 py-1 rounded bg-[var(--surface-muted)] border border-[var(--border)]">
                {currentUser.role === "admin" ? "نامحدود" : `${formatNumber(quota.remaining)} ظرفیت خالی`}
              </span>
            </div>

            {currentUser.role !== "admin" && (
              <div className="space-y-3 my-4">
                <div className="flex justify-between text-xs text-[var(--text-muted)]">
                  <span>میزان استفاده از ظرفیت:</span>
                  <span className="font-semibold text-[var(--foreground)]">
                    {formatNumber(quota.usedCount)} از {formatNumber(quota.totalLimit)} محصول ({formatNumber(usedPercentage)}٪)
                  </span>
                </div>
                <div className="w-full bg-[var(--surface-muted)] h-2 rounded-full overflow-hidden border border-[var(--border)]">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      usedPercentage >= 100 ? "bg-amber-500" : "bg-[var(--primary)]"
                    }`}
                    style={{ width: `${usedPercentage}%` }}
                  />
                </div>
                <ul className="text-xs text-[var(--text-muted)] space-y-1 list-disc list-inside pt-1">
                  <li>اسلات‌های خریداری‌شده <strong>دائمی</strong> هستند و منقضی نمی‌شوند.</li>
                  <li>با حذف یک محصول، اسلات آزاد شده و می‌توانید کالای دیگری را جایگزین کنید.</li>
                </ul>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
            <div>
              <span className="text-xs text-[var(--text-muted)] block">هزینه هر ظرفیت اضافه:</span>
              <span className="text-base font-bold text-[var(--primary)]">
                {formatNumber(slotPrice)} تومان
              </span>
            </div>
            {currentUser.role !== "admin" && (
              <button
                type="button"
                className="btn btn-primary text-xs flex items-center gap-1.5"
                onClick={() => setShowBuySlotModal(true)}
              >
                <span>⚡</span>
                <span>خرید ظرفیت جدید (+۱)</span>
              </button>
            )}
          </div>
        </div>

        {/* ستون ۲: کیف پول و شارژ اعتبار */}
        <div className="panel p-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span>💳</span>
                  <span>افزایش اعتبار کیف پول</span>
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  اعتبار کیف پول برای خرید اسلات پایش محصولات استفاده می‌شود.
                </p>
              </div>
              <div className="text-left">
                <span className="text-xs text-[var(--text-muted)] block">موجودی فعلی:</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatNumber(balance)} تومان
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3.5 text-xs text-sky-900 dark:text-sky-200 space-y-2 mb-4">
              <div className="font-bold flex items-center gap-1.5 text-sky-800 dark:text-sky-300">
                <span>ℹ️</span>
                <span>نحوه شارژ کیف پول در فاز کنونی</span>
              </div>
              <p className="leading-relaxed">
                در حال حاضر درگاه پرداخت آنلاین غیرفعال است. برای شارژ حساب خود، کافی است با مدیریت سامانه تماس بگیرید تا پس از واریز، موجودی شما به صورت دستی شارژ شود.
              </p>
              <div className="pt-2 border-t border-sky-500/20 flex flex-wrap gap-4 text-xs font-medium">
                <span>👤 پشتیبانی: مدیریت چن‌چند</span>
                <span>⚡ شارژ آنی پس از هماهنگی</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--border)] flex justify-between items-center text-xs text-[var(--text-muted)]">
            <span>درگاه پرداخت مستقیم اینترنتی به‌زودی فعال خواهد شد.</span>
          </div>
        </div>
      </div>

      {/* بخش تاریخچه تراکنش‌های کیف پول */}
      <section className="panel p-5">
        <PanelHead
          title="تاریخچه تراکنش‌های کیف پول"
          meta={`${formatNumber(transactions.length)} تراکنش`}
        />

        {transactions.length === 0 ? (
          <EmptyState text="هنوز هیچ تراکنشی در کیف پول شما ثبت نشده است." />
        ) : (
          <div className="product-table-wrap mt-3 overflow-x-auto">
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
                {transactions.map((tx) => {
                  const isPositive = tx.amount > 0;
                  return (
                    <tr key={tx.id} className="product-table-row">
                      <td>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          isPositive
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        }`}>
                          {tx.type === "admin_charge"
                            ? "شارژ دستی توسط مدیر"
                            : tx.type === "slot_purchase"
                            ? "خرید اسلات محصول"
                            : "تعدیل موجودی"}
                        </span>
                      </td>
                      <td className="font-bold text-xs" dir="ltr">
                        <span className={isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                          {isPositive ? "+" : ""}{formatNumber(tx.amount)} تومان
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
        )}
      </section>

      {/* مودال خرید ظرفیت */}
      <BuySlotModal
        isOpen={showBuySlotModal}
        onClose={() => setShowBuySlotModal(false)}
        onSuccess={() => {
          loadWallet();
          refreshCurrentUser();
        }}
      />
    </div>
  );
}
