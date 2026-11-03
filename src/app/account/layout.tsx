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

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { currentUser } = useDashboard();

  if (!currentUser) {
    return (
      <div className="account-page" dir="rtl">
        <div style={{ padding: "48px 0", textAlign: "center", fontSize: "12px", color: "var(--muted)" }}>
          در حال بارگذاری حساب کاربری...
        </div>
      </div>
    );
  }

  const roleLabel = currentUser.role === "admin" ? "مدیر کل" : "کاربر عادی";
  const userInitial = (currentUser.username?.[0] || "U").toUpperCase();

  const tabs = [
    { href: "/account/profile", label: "پروفایل و امنیت", icon: "👤" },
    { href: "/account/wallet", label: "کیف پول و سهمیه", icon: "💳" },
  ];

  return (
    <div className="account-page" dir="rtl">
      {/* سربرگ حساب کاربری با ظاهر یکپارچه و آواتار زیبا */}
      <div className="account-header-card">
        <div className="account-header-info">
          <div className="account-avatar-box" aria-hidden="true">
            {userInitial}
          </div>

          <div className="account-details">
            <nav className="account-breadcrumbs" aria-label="مسیر راهنما">
              <Link href="/products">محصولات</Link>
              <span aria-hidden="true">/</span>
              <span>حساب کاربری</span>
            </nav>

            <div className="account-title-row">
              <h1 className="account-username">
                {currentUser.username}
              </h1>
              <span className={`account-role-tag ${currentUser.role === "admin" ? "admin" : "viewer"}`}>
                {roleLabel}
              </span>
            </div>

            <p className="account-meta-text">
              {currentUser.email || "بدون ایمیل ثبت‌شده"} {currentUser.mobile ? `• ${currentUser.mobile}` : ""}
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
      <Suspense fallback={null}>
        <PaymentCallbackBanner />
      </Suspense>

      {/* تب‌بار ناوبری مسیرهای حساب کاربری */}
      <nav className="account-nav-bar" aria-label="بخش‌های حساب کاربری">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`account-nav-item ${isActive ? "is-active" : ""}`}
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
