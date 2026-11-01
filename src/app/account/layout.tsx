"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";

function PaymentCallbackBanner() {
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment_status");
  const callbackMessage = searchParams.get("message");
  const callbackRefId = searchParams.get("ref_id");

  if (!paymentStatus) return null;

  return (
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
  );
}

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { currentUser } = useDashboard();

  if (!currentUser) {
    return (
      <div className="account-page max-w-5xl mx-auto p-4 sm:p-6" dir="rtl">
        <div className="p-12 text-center text-xs text-[var(--text-muted)]">
          در حال بارگذاری حساب کاربری...
        </div>
      </div>
    );
  }

  const roleLabel = currentUser.role === "admin" ? "مدیر کل" : "کاربر عادی";

  const tabs = [
    { href: "/account/profile", label: "پروفایل", icon: "👤" },
    { href: "/account/wallet", label: "کیف پول", icon: "💳" },
  ];

  return (
    <div className="account-page space-y-6 max-w-5xl mx-auto p-4 sm:p-6" dir="rtl">
      {/* سربرگ حساب کاربری با اطلاعات شفاف و بدون تداخل متنی */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="space-y-1.5">
          <nav className="flex items-center gap-2 text-xs text-[var(--text-muted)]" aria-label="مسیر راهنما">
            <Link
              href="/products"
              className="hover:text-[var(--primary)] transition-colors flex items-center gap-1 font-medium"
            >
              <span>محصولات</span>
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-[var(--foreground)] font-semibold">حساب کاربری</span>
          </nav>

          <div className="flex flex-wrap items-center gap-3 pt-0.5">
            <h1 className="text-xl font-bold text-[var(--foreground)]" dir="ltr">
              {currentUser.username}
            </h1>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                currentUser.role === "admin"
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20"
              }`}
            >
              {roleLabel}
            </span>
          </div>

          <p className="text-sm text-[var(--text-muted)]">
            {currentUser.email || "بدون ایمیل ثبت‌شده"} {currentUser.mobile ? `• ${currentUser.mobile}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/products"
            className="btn btn-secondary text-xs flex items-center gap-1.5"
            title="بازگشت به صفحه محصولات"
          >
            <span>بازگشت به محصولات</span>
            <span aria-hidden="true">←</span>
          </Link>
        </div>
      </div>

      {/* بنر وضعیت بازگشت از درگاه پرداخت */}
      <Suspense fallback={null}>
        <PaymentCallbackBanner />
      </Suspense>

      {/* تب‌بار ناوبری مسیرهای حساب کاربری */}
      <nav className="flex border-b border-[var(--border)] gap-2" aria-label="بخش‌های حساب کاربری">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                isActive
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span aria-hidden="true">{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* محتوای روت انتخاب‌شده */}
      <main>{children}</main>
    </div>
  );
}
