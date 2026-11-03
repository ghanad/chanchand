"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";
import { formatNumber, formatDate } from "@/lib/formatters";
import { EmptyState } from "@/components/common/EmptyState";
import { PackageRow, PaymentTransactionRow, WalletTransactionRow } from "@/lib/types";

function PaymentCallbackBanner() {
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment_status");
  const callbackMessage = searchParams.get("message");
  const callbackRefId = searchParams.get("ref_id");

  if (!paymentStatus) return null;

  const isSuccess = paymentStatus === "success";

  return (
    <div
      className={`payment-alert-banner ${isSuccess ? "success" : "error"}`}
      role="alert"
    >
      <span className="payment-alert-icon" aria-hidden="true">{isSuccess ? "✅" : "⚠️"}</span>
      <div className="payment-alert-content">
        <div className="payment-alert-title">
          {isSuccess ? "پرداخت با موفقیت انجام شد" : "پرداخت ناموفق بود"}
        </div>
        {callbackMessage && <p style={{ margin: "2px 0 0 0" }}>{callbackMessage}</p>}
        {callbackRefId && (
          <p style={{ margin: "4px 0 0 0", fontFamily: "monospace", fontSize: "11.5px" }}>
            کد پیگیری تراکنش: <strong>{callbackRefId}</strong>
          </p>
        )}
      </div>
    </div>
  );
}

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

  const packagesSectionRef = useRef<HTMLDivElement>(null);

  // Data states
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Action states
  const [purchasingPkgId, setPurchasingPkgId] = useState<number | null>(null);
  const [buyingSlot, setBuyingSlot] = useState(false);
  const [activeTxTab, setActiveTxTab] = useState<"wallet" | "payments">("wallet");
  const [copiedRefId, setCopiedRefId] = useState<string | null>(null);

  // Focus packages section if query param focus=topup
  useEffect(() => {
    if (searchParams.get("focus") === "topup" && packagesSectionRef.current) {
      packagesSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
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

  if (!currentUser) {
    return (
      <div className="wallet-view-container" dir="rtl">
        <div style={{ padding: "48px 0", textAlign: "center", fontSize: "12.5px", color: "var(--muted)" }}>
          در حال بارگذاری اطلاعات کیف پول...
        </div>
      </div>
    );
  }

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
  const deficit = Math.max(0, slotPrice - balance);
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

  // Copy ref ID helper
  function handleCopyRefId(refId: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(refId);
      setCopiedRefId(refId);
      showToast("کد پیگیری کپی شد.");
      setTimeout(() => setCopiedRefId(null), 2000);
    }
  }

  return (
    <div className="wallet-view-container" dir="rtl">
      {/* سربرگ اختصاصی صفحه کیف پول و سهمیه پایش */}
      <div className="account-header-card">
        <div className="account-header-info">
          <div className="account-avatar-box wallet-avatar-box" aria-hidden="true">
            💳
          </div>

          <div className="account-details">
            <nav className="account-breadcrumbs" aria-label="مسیر راهنما">
              <Link href="/products">محصولات</Link>
              <span aria-hidden="true">/</span>
              <span>کیف پول و سهمیه پایش</span>
            </nav>

            <div className="account-title-row">
              <h1 className="account-username">
                کیف پول و مدیریت سهمیه پایش
              </h1>
            </div>

            <p className="account-meta-text">
              مدیریت موجودی اعتباری، بسته‌های افزایش ظرفیت و سوابق مالی کاربر @{currentUser.username}
            </p>
          </div>
        </div>

        <div>
          <Link
            href="/products"
            className="btn btn-secondary btn-sm"
            title="بازگشت به صفحه محصولات"
          >
            <span>بازگشت به محصولات</span>
            <span aria-hidden="true">←</span>
          </Link>
        </div>
      </div>

      {/* بنر وضعیت بازگشت از درگاه پرداخت */}
      <PaymentCallbackBanner />

      {/* بخش ۱: کارت دوتایی هدر (کارت اعتباری کیف پول + کارت وضعیت سهمیه) */}
      <section className="wallet-hero-grid" aria-label="کیف پول و سهمیه پایش">
        {/* ۱. کارت اعتباری دیجیتال */}
        <div className="wallet-credit-card">
          <div className="wallet-card-header">
            <div className="wallet-card-brand">
              <div className="wallet-card-chip-icon" aria-hidden="true" />
              <span className="wallet-card-title">کیف پول اعتباری چن‌چند</span>
            </div>
            <span className="wallet-card-user-tag" dir="ltr">
              @{currentUser.username}
            </span>
          </div>

          <div className="wallet-card-middle">
            <div className="wallet-card-balance-lbl">موجودی در دسترس</div>
            <div className="wallet-card-balance-val">
              <strong>{formatNumber(balance)}</strong>
              <span>تومان</span>
            </div>
          </div>

          <div className="wallet-card-actions">
            {currentUser.role !== "admin" && (
              <button
                type="button"
                disabled={!canAffordSlot || buyingSlot}
                onClick={handleBuySlotFromWallet}
                className="wallet-card-btn-primary"
                title={canAffordSlot ? "خرید مستقیم یک اسلات از موجودی" : `کسری موجودی: ${formatNumber(deficit)} تومان`}
              >
                {buyingSlot ? (
                  <span>در حال فعال‌سازی...</span>
                ) : (
                  <>
                    <span>خرید ۱ اسلات با موجودی</span>
                    <span aria-hidden="true">⚡</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                packagesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="wallet-card-btn-secondary"
            >
              <span>+ افزایش اعتبار با بسته‌ها</span>
              <span aria-hidden="true">↓</span>
            </button>
          </div>
        </div>

        {/* ۲. کارت تحلیلی سهمیه و پایش */}
        <div className="wallet-quota-card">
          <div className="wallet-quota-top">
            <div className="wallet-quota-heading">
              <h3>
                <span aria-hidden="true">📊</span>
                <span>وضعیت ظرفیت پایش محصولات</span>
              </h3>
              <span>
                {currentUser.role === "admin"
                  ? "کاربر مدیر — پایش نامحدود"
                  : `${formatNumber(quota.usedCount)} از ${formatNumber(quota.totalLimit)} محصول فعال`}
              </span>
            </div>

            <div className="wallet-quota-pill">
              {currentUser.role === "admin"
                ? "نامحدود"
                : `${formatNumber(quota.remaining)} محصول خالی`}
            </div>
          </div>

          <div className="wallet-progress-block">
            {currentUser.role !== "admin" ? (
              <>
                <div className="wallet-progress-track">
                  <div
                    className={`wallet-progress-bar-fill ${usedPercentage >= 100 ? "warning" : ""}`}
                    style={{ width: `${usedPercentage}%` }}
                  />
                </div>
                <div className="wallet-progress-labels">
                  <span>{formatNumber(usedPercentage)}٪ تکمیل شده</span>
                  <span>سقف کل: {formatNumber(quota.totalLimit)} کالا</span>
                </div>
              </>
            ) : (
              <div style={{ height: "9px" }} />
            )}
          </div>

          <div className="wallet-quota-metrics-row">
            <div className="wallet-quota-mini-stat">
              <div className="wallet-quota-mini-num">{formatNumber(freeQuotaUsed)} / ۳</div>
              <div className="wallet-quota-mini-lbl">سهمیه پایه رایگان</div>
            </div>

            <div className="wallet-quota-mini-stat">
              <div className="wallet-quota-mini-num">
                {currentUser.role === "admin" ? "∞" : `+${formatNumber(extraSlots)}`}
              </div>
              <div className="wallet-quota-mini-lbl">اسلات‌های خریداری‌شده</div>
            </div>

            <div className="wallet-quota-mini-stat">
              <div className="wallet-quota-mini-num">
                {currentUser.role === "admin" ? "∞" : formatNumber(quota.remaining)}
              </div>
              <div className="wallet-quota-mini-lbl">ظرفیت باقی‌مانده</div>
            </div>
          </div>

          <div className="wallet-quota-note">
            <span aria-hidden="true">🛡️</span>
            <span>تمام ظرفیت‌های تهیه‌شده دائمی بوده و با حذف کالا، ظرفیت بلافاصله آزاد می‌گردد.</span>
          </div>
        </div>
      </section>

      {/* بنر اطلاع‌رسانی خرید تکی از موجودی کیف پول */}
      {currentUser.role !== "admin" && (
        <div className="wallet-direct-slot-panel">
          <div className="wallet-direct-slot-info">
            <div className="wallet-direct-slot-icon" aria-hidden="true">
              ⚡
            </div>
            <div className="wallet-direct-slot-text">
              <h4>خرید تک‌اسلات پایش با کسر از موجودی کیف پول</h4>
              <p>
                تعرفه هر اسلات پایش دائمی: <strong>{formatNumber(slotPrice)} تومان</strong>
                {canAffordSlot ? (
                  <span style={{ color: "var(--ok)", marginInlineStart: "8px" }}>
                    (موجودی شما کافی است)
                  </span>
                ) : (
                  <span style={{ color: "var(--danger)", marginInlineStart: "8px" }}>
                    (کسری موجودی: {formatNumber(deficit)} تومان)
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="wallet-direct-slot-actions">
            <button
              type="button"
              disabled={!canAffordSlot || buyingSlot}
              onClick={handleBuySlotFromWallet}
              className="btn btn-primary btn-sm"
            >
              {buyingSlot ? (
                <span>در حال ثبت...</span>
              ) : canAffordSlot ? (
                <span>خرید ۱ اسلات ({formatNumber(slotPrice)} تومان)</span>
              ) : (
                <span>موجودی ناکافی است</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* بخش ۲: بسته‌های افزایش ظرفیت آنلاین (با درگاه بانکی) */}
      <section
        ref={packagesSectionRef}
        id="packages-section"
        className="wallet-packages-section"
        aria-label="بسته‌های افزایش ظرفیت پایش"
      >
        <div className="wallet-section-header">
          <div className="wallet-section-titles">
            <h2>
              <span aria-hidden="true">🎁</span>
              <span>بسته‌های افزایش ظرفیت پایش (پرداخت آنلاین)</span>
            </h2>
            <p>
              با خرید هر بسته، اسلات‌های پایش دائمی فوراً به حسابتان افزوده می‌شوند و از طریق کلیه کارت‌های عضو شتاب قابل پرداخت هستند.
            </p>
          </div>

          <div style={{ fontSize: "12px", color: "var(--muted)" }}>
            هزینه پایه هر اسلات: {formatNumber(slotPrice)} تومان
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", fontSize: "12.5px", color: "var(--muted)" }}>
            در حال بارگذاری بسته‌های ارتقا...
          </div>
        ) : packages.length === 0 ? (
          <EmptyState text="در حال حاضر بسته‌ای برای خرید فعال نیست." />
        ) : (
          <div className="wallet-packages-grid">
            {packages.map((pkg, idx) => {
              const isBuying = purchasingPkgId === pkg.id;
              // Highlight middle package or package with slots >= 5 as featured
              const isFeatured = pkg.slots >= 5 && (packages.length <= 3 ? idx === 1 : true);
              const pricePerSlot = Math.round(pkg.price_toman / Math.max(1, pkg.slots));

              return (
                <div
                  key={pkg.id}
                  className={`wallet-package-card ${isFeatured ? "featured" : ""}`}
                >
                  {isFeatured && (
                    <div className="wallet-package-popular-ribbon">
                      پیشنهادی و پرطرفدار
                    </div>
                  )}

                  <div>
                    <div className="wallet-package-top">
                      <h3 className="wallet-package-title">{pkg.title}</h3>
                      <span className="wallet-package-slots-tag">
                        +{formatNumber(pkg.slots)} محصول
                      </span>
                    </div>

                    <p className="wallet-package-desc">
                      {pkg.description || `افزایش ظرفیت پایش شما به میزان ${formatNumber(pkg.slots)} محصول دائمی بدون انقضا.`}
                    </p>
                  </div>

                  <div>
                    <div className="wallet-package-pricing-wrap">
                      <div className="wallet-package-price-row">
                        <strong>{formatNumber(pkg.price_toman)}</strong>
                        <span>تومان</span>
                      </div>
                      <div className="wallet-package-per-slot-text">
                        هر اسلات فقط: {formatNumber(pricePerSlot)} تومان
                      </div>
                    </div>

                    <ul className="wallet-package-features-list">
                      <li className="wallet-package-feature-item">
                        <span aria-hidden="true">✓</span>
                        <span>فعال‌سازی آنی و خودکار پس از پرداخت</span>
                      </li>
                      <li className="wallet-package-feature-item">
                        <span aria-hidden="true">✓</span>
                        <span>ظرفیت دائمی بدون نیاز به تمدید ماهانه</span>
                      </li>
                      <li className="wallet-package-feature-item">
                        <span aria-hidden="true">✓</span>
                        <span>پایش منظم نرخ‌ها و آرشیو تغییرات</span>
                      </li>
                    </ul>

                    <button
                      type="button"
                      disabled={purchasingPkgId !== null}
                      onClick={() => handleBuyPackage(pkg)}
                      className={`btn btn-primary wallet-package-buy-btn ${isFeatured ? "" : "btn-secondary"}`}
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
      </section>

      {/* بخش ۳: تاریخچه تراکنش‌ها */}
      <section className="wallet-tx-panel" aria-label="تاریخچه تراکنش‌های کیف پول و پرداخت‌ها">
        <div className="wallet-tx-panel-header">
          <div className="wallet-section-titles">
            <h2>
              <span aria-hidden="true">🧾</span>
              <span>تاریخچه و گزارش مالی</span>
            </h2>
            <p>مشاهده گردش حساب کیف پول و سوابق پرداخت‌های بانکی</p>
          </div>

          <div className="wallet-tab-switch-group">
            <button
              type="button"
              onClick={() => setActiveTxTab("wallet")}
              className={`wallet-tab-switch-btn ${activeTxTab === "wallet" ? "active" : ""}`}
            >
              <span>گردش کیف پول</span>
              <span className="wallet-tab-count-badge">
                {formatNumber(walletTransactions.length)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTxTab("payments")}
              className={`wallet-tab-switch-btn ${activeTxTab === "payments" ? "active" : ""}`}
            >
              <span>پرداخت‌های درگاه</span>
              <span className="wallet-tab-count-badge">
                {formatNumber(paymentTransactions.length)}
              </span>
            </button>
          </div>
        </div>

        {/* ۱. جدول تراکنش‌های کیف پول */}
        {activeTxTab === "wallet" && (
          walletTransactions.length === 0 ? (
            <EmptyState text="هنوز هیچ تراکنشی در کیف پول شما ثبت نشده است." />
          ) : (
            <div className="wallet-table-wrap">
              <table className="wallet-table" aria-label="جدول گردش کیف پول">
                <thead>
                  <tr>
                    <th scope="col">نوع تراکنش</th>
                    <th scope="col">مبلغ</th>
                    <th scope="col">موجودی پس از تراکنش</th>
                    <th scope="col">شرح و توضیحات</th>
                    <th scope="col">تاریخ و زمان</th>
                  </tr>
                </thead>
                <tbody>
                  {walletTransactions.map((tx) => {
                    const isPositive = tx.amount > 0;
                    return (
                      <tr key={tx.id}>
                        <td>
                          <span
                            className="status-pill"
                            style={{
                              background: isPositive ? "rgba(19, 118, 79, 0.08)" : "rgba(180, 59, 59, 0.08)",
                              color: isPositive ? "var(--ok)" : "var(--danger)",
                              border: `1px solid ${isPositive ? "rgba(19, 118, 79, 0.2)" : "rgba(180, 59, 59, 0.2)"}`,
                            }}
                          >
                            {tx.type === "admin_charge"
                              ? "شارژ توسط مدیر"
                              : tx.type === "slot_purchase"
                              ? "خرید اسلات محصول"
                              : "تعدیل موجودی"}
                          </span>
                        </td>
                        <td>
                          <span className={isPositive ? "wallet-amount-positive" : "wallet-amount-negative"}>
                            {isPositive ? "+" : ""}
                            {formatNumber(tx.amount)} تومان
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFeatureSettings: "tnum", direction: "ltr", display: "inline-block" }}>
                            {formatNumber(tx.balance_after)} تومان
                          </span>
                        </td>
                        <td style={{ color: "var(--muted)" }}>
                          {tx.description || "-"}
                        </td>
                        <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
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

        {/* ۲. جدول پرداخت‌های آنلاین درگاه */}
        {activeTxTab === "payments" && (
          paymentTransactions.length === 0 ? (
            <EmptyState text="هنوز هیچ پرداخت آنلاینی در حساب شما ثبت نشده است." />
          ) : (
            <div className="wallet-table-wrap">
              <table className="wallet-table" aria-label="جدول پرداخت‌های بانکی">
                <thead>
                  <tr>
                    <th scope="col">عنوان بسته</th>
                    <th scope="col">اسلات‌های دریافتی</th>
                    <th scope="col">مبلغ پرداختی</th>
                    <th scope="col">درگاه بانکی</th>
                    <th scope="col">وضعیت تراکنش</th>
                    <th scope="col">کد پیگیری شتاب</th>
                    <th scope="col">تاریخ پرداخت</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td style={{ fontWeight: 600 }}>
                        {tx.package_title}
                      </td>
                      <td>
                        <span className="wallet-package-slots-tag">
                          +{formatNumber(tx.slots)}
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontFeatureSettings: "tnum", direction: "ltr", display: "inline-block" }}>
                          {formatNumber(tx.amount_toman)} تومان
                        </strong>
                      </td>
                      <td style={{ color: "var(--muted)" }}>
                        {tx.gateway === "zarinpal" ? "زرین‌پال" : tx.gateway === "mock" ? "آزمایشی" : tx.gateway}
                      </td>
                      <td>
                        <span
                          className="status-pill"
                          style={{
                            background:
                              tx.status === "paid"
                                ? "rgba(19, 118, 79, 0.1)"
                                : tx.status === "pending"
                                ? "rgba(217, 119, 6, 0.1)"
                                : "rgba(180, 59, 59, 0.1)",
                            color:
                              tx.status === "paid"
                                ? "var(--ok)"
                                : tx.status === "pending"
                                ? "var(--warn)"
                                : "var(--danger)",
                            border: `1px solid ${
                              tx.status === "paid"
                                ? "rgba(19, 118, 79, 0.25)"
                                : tx.status === "pending"
                                ? "rgba(217, 119, 6, 0.25)"
                                : "rgba(180, 59, 59, 0.25)"
                            }`,
                          }}
                        >
                          {tx.status === "paid"
                            ? "پرداخت موفق"
                            : tx.status === "pending"
                            ? "در انتظار پرداخت"
                            : "ناموفق / لغو شده"}
                        </span>
                      </td>
                      <td>
                        {tx.ref_id ? (
                          <button
                            type="button"
                            onClick={() => handleCopyRefId(tx.ref_id!)}
                            className="wallet-ref-code"
                            title="کلیک برای کپی کد پیگیری"
                            style={{ cursor: "pointer", border: "1px dashed var(--line)" }}
                          >
                            {tx.ref_id} {copiedRefId === tx.ref_id ? "✓" : ""}
                          </button>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>-</span>
                        )}
                      </td>
                      <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
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
    <Suspense
      fallback={
        <div style={{ padding: "48px 0", textAlign: "center", fontSize: "12.5px", color: "var(--muted)" }}>
          در حال بارگذاری اطلاعات کیف پول...
        </div>
      }
    >
      <WalletContent />
    </Suspense>
  );
}
