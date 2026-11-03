"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useDashboard } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";
import { PanelHead } from "@/components/common/PanelHead";

export default function AccountProfilePage() {
  const { currentUser, showToast, refreshCurrentUser } = useDashboard();

  // Profile form state
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Change password form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (currentUser) {
      setEmail(currentUser.email || "");
      setMobile(currentUser.mobile || "");
    }
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="account-page" dir="rtl">
        <div style={{ padding: "48px 0", textAlign: "center", fontSize: "12px", color: "var(--muted)" }}>
          در حال بارگذاری اطلاعات حساب کاربری...
        </div>
      </div>
    );
  }

  const roleLabel = currentUser.role === "admin" ? "مدیر کل" : "کاربر عادی";
  const userInitial = (currentUser.username?.[0] || "U").toUpperCase();

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
      setProfileMessage({
        type: "error",
        text: err instanceof Error ? err.message : "خطا در ذخیره اطلاعات",
      });
    } finally {
      setProfileSaving(false);
    }
  }

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
      setPasswordMessage({
        type: "error",
        text: err instanceof Error ? err.message : "خطا در تغییر کلمه عبور",
      });
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="account-page" dir="rtl">
      {/* سربرگ اختصاصی صفحه پروفایل با ظاهر شکیل و بدون تب‌بار */}
      <div className="account-header-card">
        <div className="account-header-info">
          <div className="account-avatar-box" aria-hidden="true">
            {userInitial}
          </div>

          <div className="account-details">
            <nav className="account-breadcrumbs" aria-label="مسیر راهنما">
              <Link href="/products">محصولات</Link>
              <span aria-hidden="true">/</span>
              <span>پروفایل و امنیت کاربری</span>
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

      <div className="profile-content-container">
        {/* بخش ۱: مشخصات کاربری */}
        <div className="profile-panel">
          <PanelHead title="مشخصات کاربری" meta="مدیریت آدرس ایمیل و شماره موبایل" />

          {profileMessage && (
            <div
              className={`profile-alert ${profileMessage.type}`}
              role="alert"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                {profileMessage.type === "success" ? (
                  <>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </>
                ) : (
                  <>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </>
                )}
              </svg>
              <span>{profileMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="profile-form">
            <div className="profile-field">
              <label className="profile-label">
                <span>نام کاربری</span>
                <span className="profile-label-badge">غیرقابل ویرایش</span>
              </label>
              <input
                type="text"
                disabled
                dir="ltr"
                value={currentUser.username}
                className="profile-input"
              />
            </div>

            <div className="profile-field">
              <label className="profile-label" htmlFor="profile-email">
                <span>آدرس ایمیل</span>
              </label>
              <input
                id="profile-email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="profile-input"
              />
              <span className="profile-hint">برای دریافت اطلاعیه‌ها و بازیابی حساب</span>
            </div>

            <div className="profile-field">
              <label className="profile-label" htmlFor="profile-mobile">
                <span>شماره موبایل</span>
              </label>
              <input
                id="profile-mobile"
                type="tel"
                dir="ltr"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                className="profile-input"
              />
              <span className="profile-hint">شماره همراه معتبر جهت احراز هویت</span>
            </div>

            <div style={{ paddingTop: "8px" }}>
              <button
                type="submit"
                disabled={profileSaving}
                className="btn btn-primary"
                style={{ width: "100%" }}
              >
                {profileSaving ? (
                  <>
                    <span className="spinner-sm" aria-hidden="true" />
                    <span>در حال ذخیره...</span>
                  </>
                ) : (
                  <>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    <span>ذخیره تغییرات مشخصات</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* بخش ۲: تغییر کلمه عبور */}
        <div className="profile-panel">
          <PanelHead title="تغییر کلمه عبور" meta="امنیت و کلمه عبور حساب کاربری" />

          {passwordMessage && (
            <div
              className={`profile-alert ${passwordMessage.type}`}
              role="alert"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                {passwordMessage.type === "success" ? (
                  <>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </>
                ) : (
                  <>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </>
                )}
              </svg>
              <span>{passwordMessage.text}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="profile-form">
            <div className="profile-field">
              <label className="profile-label" htmlFor="new-password">
                <span>کلمه عبور جدید</span>
                <span className="profile-label-badge">حداقل ۶ کاراکتر</span>
              </label>
              <div className="profile-password-wrapper">
                <input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  dir="ltr"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="کلمه عبور جدید را وارد کنید"
                  required
                  minLength={6}
                  className="profile-input"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="password-toggle-btn"
                  aria-label={showNewPassword ? "مخفی کردن کلمه عبور" : "نمایش کلمه عبور"}
                  title={showNewPassword ? "مخفی کردن کلمه عبور" : "نمایش کلمه عبور"}
                >
                  {showNewPassword ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="profile-field">
              <label className="profile-label" htmlFor="confirm-password">
                <span>تکرار کلمه عبور جدید</span>
              </label>
              <div className="profile-password-wrapper">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="تکرار کلمه عبور جدید را وارد کنید"
                  required
                  minLength={6}
                  className="profile-input"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="password-toggle-btn"
                  aria-label={showConfirmPassword ? "مخفی کردن کلمه عبور" : "نمایش کلمه عبور"}
                  title={showConfirmPassword ? "مخفی کردن کلمه عبور" : "نمایش کلمه عبور"}
                >
                  {showConfirmPassword ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <span
                  className={`profile-hint ${
                    newPassword === confirmPassword ? "ok" : "error"
                  }`}
                >
                  {newPassword === confirmPassword
                    ? "✓ کلمه عبور و تکرار آن یکسان هستند"
                    : "✕ تکرار کلمه عبور با کلمه عبور جدید یکسان نیست"}
                </span>
              )}
            </div>

            <div className="profile-security-box">
              <div className="profile-security-box-title">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>راهنمای امنیت کلمه عبور</span>
              </div>
              <ul>
                <li>حداقل ۶ کاراکتر (ترجیحاً حروف، ارقام و علائم)</li>
                <li>از کلمات عبور تکراری یا ساده استفاده نکنید</li>
              </ul>
            </div>

            <div style={{ paddingTop: "8px" }}>
              <button
                type="submit"
                disabled={passwordSaving}
                className="btn btn-primary"
                style={{ width: "100%" }}
              >
                {passwordSaving ? (
                  <>
                    <span className="spinner-sm" aria-hidden="true" />
                    <span>در حال به‌روزرسانی...</span>
                  </>
                ) : (
                  <>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>به‌روزرسانی کلمه عبور</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

