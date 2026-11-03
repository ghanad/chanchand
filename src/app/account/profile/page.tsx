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
        <div className="panel p-6 space-y-5">
          <PanelHead title="مشخصات کاربری" meta="مدیریت آدرس ایمیل و شماره موبایل" />

          {profileMessage && (
            <div
              className={`p-3 rounded-lg text-xs ${
                profileMessage.type === "success"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20"
              }`}
              role="alert"
            >
              {profileMessage.text}
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                نام کاربری (غیرقابل تغییر)
              </label>
              <input
                type="text"
                disabled
                dir="ltr"
                value={currentUser.username}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)] cursor-not-allowed font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
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
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
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
                className="btn btn-primary text-xs w-full py-2.5 font-bold"
              >
                {profileSaving ? "در حال ذخیره..." : "ذخیره تغییرات مشخصات"}
              </button>
            </div>
          </form>
        </div>

        {/* بخش ۲: تغییر کلمه عبور */}
        <div className="panel p-6 space-y-5">
          <PanelHead title="تغییر کلمه عبور" meta="امنیت و کلمه عبور حساب کاربری" />

          {passwordMessage && (
            <div
              className={`p-3 rounded-lg text-xs ${
                passwordMessage.type === "success"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20"
              }`}
              role="alert"
            >
              {passwordMessage.text}
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
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
                  title={showNewPassword ? "مخفی کردن" : "نمایش"}
                >
                  {showNewPassword ? "👁️" : "🙈"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
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
                  title={showConfirmPassword ? "مخفی کردن" : "نمایش"}
                >
                  {showConfirmPassword ? "👁️" : "🙈"}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={passwordSaving}
                className="btn btn-secondary text-xs w-full py-2.5 font-bold"
              >
                {passwordSaving ? "در حال به‌روزرسانی..." : "به‌روزرسانی کلمه عبور"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

