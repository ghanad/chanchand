"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";
import { formatNumber, formatDate } from "@/lib/formatters";
import { PanelHead } from "@/components/common/PanelHead";
import { Metric } from "@/components/common/Metric";
import { EmptyState } from "@/components/common/EmptyState";
import { PackageRow, PaymentTransactionRow } from "@/lib/types";

type AccountTab = "info" | "quota" | "payments";

export function AccountView() {
  const searchParams = useSearchParams();
  const { currentUser, showToast, refreshCurrentUser } = useDashboard();

  const initialTab = (searchParams.get("tab") as AccountTab) || "info";
  const [activeTab, setActiveTab] = useState<AccountTab>(initialTab);

  // Tab 1: Profile form state
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Tab 1: Change password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Tab 2: Packages state
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [purchasingPkgId, setPurchasingPkgId] = useState<number | null>(null);

  // Tab 3: Transactions state
  const [transactions, setTransactions] = useState<PaymentTransactionRow[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  // Payment callback banner state
  const paymentStatus = searchParams.get("payment_status");
  const callbackMessage = searchParams.get("message");
  const callbackRefId = searchParams.get("ref_id");

  // Sync profile data when currentUser loads
  useEffect(() => {
    if (currentUser) {
      setEmail(currentUser.email || "");
      setMobile(currentUser.mobile || "");
    }
  }, [currentUser]);

  // Sync tab from URL if changes
  useEffect(() => {
    const tab = searchParams.get("tab") as AccountTab;
    if (tab && (tab === "info" || tab === "quota" || tab === "payments")) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Load packages
  const loadPackages = useCallback(async () => {
    setPackagesLoading(true);
    try {
      const data = await requestJson<{ packages: PackageRow[] }>("/api/packages");
      setPackages(data.packages || []);
    } catch {
      // Ignore background load error
    } finally {
      setPackagesLoading(false);
    }
  }, []);

  // Load transactions
  const loadTransactions = useCallback(async () => {
    setTransactionsLoading(true);
    try {
      const data = await requestJson<{ transactions: PaymentTransactionRow[] }>("/api/payments");
      setTransactions(data.transactions || []);
    } catch {
      // Ignore background load error
    } finally {
      setTransactionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "quota") {
      loadPackages();
    } else if (activeTab === "payments") {
      loadTransactions();
    }
  }, [activeTab, loadPackages, loadTransactions]);

  // Handle profile update
  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const res = await requestJson<{ success: boolean; message: string }>("/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({ email, mobile }),
      });
      setProfileMessage({ type: "success", text: res.message || "اطلاعات با موفقیت ذخیره شد." });
      showToast("مشخصات حساب ذخیره شد.");
      await refreshCurrentUser();
    } catch (err: any) {
      setProfileMessage({ type: "error", text: err instanceof Error ? err.message : "خطا در ذخیره اطلاعات" });
    } finally {
      setProfileSaving(false);
    }
  }

  // Handle password update
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 6) {
      setPasswordMessage({ type: "error", text: "کلمه عبور باید حداقل ۶ کاراکتر باشد." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "کلمه عبور جدید و تکرار آن یکسان نیستند." });
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await requestJson<{ success: boolean; message: string }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });
      setPasswordMessage({ type: "success", text: res.message || "کلمه عبور با موفقیت به‌روزرسانی شد." });
      setNewPassword("");
      setConfirmPassword("");
      showToast("کلمه عبور تغییر یافت.");
    } catch (err: any) {
      setPasswordMessage({ type: "error", text: err instanceof Error ? err.message : "خطا در تغییر کلمه عبور" });
    } finally {
      setPasswordSaving(false);
    }
  }

  // Handle buying a package
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
      showToast(err instanceof Error ? err.message : "خطا در ایجاد درخواست پرداخت");
      setPurchasingPkgId(null);
    }
  }

  if (!currentUser) return null;

  const quota = currentUser.quota || {
    freeLimit: 3,
    extraSlots: currentUser.extra_slots ?? 0,
    totalLimit: 3 + (currentUser.extra_slots ?? 0),
    usedCount: 0,
    remaining: 3,
    canAdd: true,
  };

  const freeQuotaUsed = Math.min(quota.usedCount, 3);
  const extraSlots = currentUser.extra_slots ?? 0;
  const extraQuotaUsed = Math.max(0, quota.usedCount - 3);
  const usedPercentage = Math.min(
    100,
    Math.round((quota.usedCount / Math.max(1, quota.totalLimit)) * 100)
  );

  return (
    <div className="account-page space-y-6 max-w-5xl mx-auto p-4 sm:p-6" dir="rtl">
      {/* سربرگ حساب کاربری */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[var(--primary)] to-emerald-400 text-white flex items-center justify-center font-bold text-2xl shadow-md">
            {(currentUser.username?.[0] || "U").toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span>{currentUser.username}</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  currentUser.role === "admin"
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20"
                }`}
              >
                {currentUser.role === "admin" ? "مدیر کل" : "کاربر عادی"}
              </span>
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              {currentUser.email || "بدون ایمیل ثبت‌شده"} {currentUser.mobile ? `• ${currentUser.mobile}` : ""}
            </p>
          </div>
        </div>

      </div>

      {/* بنر نتیجه بازگشت از درگاه پرداخت */}
      {paymentStatus && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            paymentStatus === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
              : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200"
          }`}
          role="alert"
        >
          <span className="text-xl">{paymentStatus === "success" ? "✅" : "⚠️"}</span>
          <div className="space-y-1 text-xs leading-relaxed">
            <div className="font-bold text-sm">
              {paymentStatus === "success" ? "پرداخت با موفقیت انجام شد" : "پرداخت ناموفق بود"}
            </div>
            {callbackMessage && <p>{callbackMessage}</p>}
            {callbackRefId && (
              <p className="font-mono text-[11px] opacity-90">
                کد پیگیری تراکنش: <strong>{callbackRefId}</strong>
              </p>
            )}
          </div>
        </div>
      )}

      {/* ناوبری تب‌ها */}
      <div className="flex border-b border-[var(--border)] gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("info")}
          className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "info"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]"
          }`}
        >
          <span>👤</span>
          <span>اطلاعات حساب</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("quota")}
          className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "quota"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]"
          }`}
        >
          <span>⚡</span>
          <span>سهمیه و طرح‌ها</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "payments"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]"
          }`}
        >
          <span>💳</span>
          <span>پرداخت‌ها</span>
        </button>
      </div>

      {/* محتوای تب ۱: مشخصات حساب و تغییر رمز عبور */}
      {activeTab === "info" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* فرم ویرایش مشخصات */}
          <div className="panel p-5 space-y-4">
            <PanelHead title="مشخصات کاربری" meta="ایمیل و شماره موبایل" />

            {profileMessage && (
              <div
                className={`p-3 rounded-lg text-xs ${
                  profileMessage.type === "success"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20"
                }`}
              >
                {profileMessage.text}
              </div>
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  نام کاربری (غیرقابل تغییر)
                </label>
                <input
                  type="text"
                  disabled
                  value={currentUser.username}
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)] cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  آدرس ایمیل
                </label>
                <input
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  شماره موبایل
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="btn btn-primary text-xs w-full py-2"
                >
                  {profileSaving ? "در حال ذخیره..." : "ذخیره تغییرات مشخصات"}
                </button>
              </div>
            </form>
          </div>

          {/* فرم تغییر رمز عبور */}
          <div className="panel p-5 space-y-4">
            <PanelHead title="تغییر کلمه عبور" meta="امنیت حساب" />

            {passwordMessage && (
              <div
                className={`p-3 rounded-lg text-xs ${
                  passwordMessage.type === "success"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20"
                }`}
              >
                {passwordMessage.text}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  کلمه عبور جدید
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    dir="ltr"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="حداقل ۶ کاراکتر"
                    required
                    minLength={6}
                    className="w-full text-xs p-2.5 pl-9 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--foreground)]"
                  >
                    {showNewPassword ? "👁️" : "🙈"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  تکرار کلمه عبور جدید
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    dir="ltr"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="تکرار دقیق کلمه عبور"
                    required
                    minLength={6}
                    className="w-full text-xs p-2.5 pl-9 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--foreground)]"
                  >
                    {showConfirmPassword ? "👁️" : "🙈"}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="btn btn-secondary text-xs w-full py-2"
                >
                  {passwordSaving ? "در حال به‌روزرسانی..." : "به‌روزرسانی کلمه عبور"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* محتوای تب ۲: سهمیه، وضعیت استفاده و بسته‌های افزایش ظرفیت */}
      {activeTab === "quota" && (
        <div className="space-y-6">
          {/* کارت‌های خلاصه سهمیه */}
          <section className="product-summary-grid" aria-label="خلاصه ظرفیت محصولات">
            <Metric
              label="سهمیه رایگان پایه"
              value={`${formatNumber(freeQuotaUsed)} از ۳ محصول`}
            />
            <Metric
              label="ظرفیت‌های خریداری‌شده"
              value={
                currentUser.role === "admin"
                  ? "نامحدود"
                  : `${formatNumber(extraSlots)} اسلات (+${formatNumber(extraQuotaUsed)} استفاده شده)`
              }
            />
            <Metric
              label="مجموع کل ظرفیت"
              value={
                currentUser.role === "admin"
                  ? "نامحدود"
                  : `${formatNumber(quota.usedCount)} از ${formatNumber(quota.totalLimit)}`
              }
            />
            <Metric
              label="ظرفیت خالی باقی‌مانده"
              value={
                currentUser.role === "admin"
                  ? "نامحدود"
                  : `${formatNumber(quota.remaining)} محصول`
              }
            />
          </section>

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
              <p>• پایش ۳ محصول اول برای تمام کاربران <strong>رایگان و دائمی</strong> است.</p>
              <p>• اسلات‌های اضافه به صورت <strong>اشتراک ماهانه (۳۰ روزه)</strong> فعال شده و قابل تمدید هستند.</p>
              <p>• با حذف هر محصول، ظرفیت آن آزاد شده و بلافاصله می‌توانید محصول دیگری جایگزین کنید.</p>
            </div>
          </div>

          {/* بسته‌های افزایش ظرفیت */}
          <div className="space-y-4">
            <PanelHead
              title="خرید بسته افزایش ظرفیت"
              meta="پرداخت امن آنلاین از طریق درگاه بانکی"
            />

            {packagesLoading ? (
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
      )}

      {/* محتوای تب ۳: تاریخچه پرداخت‌ها */}
      {activeTab === "payments" && (
        <section className="panel p-5 space-y-4">
          <PanelHead
            title="تاریخچه تراکنش‌های پرداختی"
            meta={`${formatNumber(transactions.length)} تراکنش ثبت‌شده`}
          />

          {transactionsLoading ? (
            <div className="p-12 text-center text-xs text-[var(--text-muted)]">
              در حال بارگذاری تراکنش‌ها...
            </div>
          ) : transactions.length === 0 ? (
            <EmptyState text="هنوز هیچ تراکنشی در حساب شما ثبت نشده است." />
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
                  {transactions.map((tx) => (
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
          )}
        </section>
      )}
    </div>
  );
}
