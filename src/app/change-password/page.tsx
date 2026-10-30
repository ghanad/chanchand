"use client";

import React, { useState } from "react";
import Link from "next/link";
import { requestJson } from "@/lib/api-client";
import { useDashboard } from "@/context/DashboardContext";

export default function ChangePasswordPage() {
  const { showToast, logout, currentUser } = useDashboard();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("کلمه عبور جدید باید حداقل شامل ۶ کاراکتر باشد.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("کلمه عبور جدید و تکرار آن یکسان نیستند.");
      return;
    }

    setLoading(true);

    try {
      const response = await requestJson<{
        success: boolean;
        message: string;
        user: { id: number; username: string; role: "admin" | "viewer" };
      }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });

      showToast(response.message || "کلمه عبور با موفقیت به‌روزرسانی شد.");
      const target = response.user.role === "admin" ? "/admin" : "/";
      window.location.href = target;
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "خطا در تغییر کلمه عبور");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-brand">
          <h1>تغییر کلمه عبور</h1>
        </div>

        {error && (
          <div className="login-alert error" role="alert">
            <svg
              className="login-alert-icon"
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
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="login-alert-text">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="newPassword">کلمه عبور جدید</label>
            <div className="password-input-wrapper">
              <input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                required
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="حداقل ۶ کاراکتر"
                disabled={loading}
                autoComplete="new-password"
                minLength={6}
                dir="ltr"
                className="ltr-input password-input"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowNewPassword((prev) => !prev)}
                aria-label={showNewPassword ? "مخفی کردن کلمه عبور" : "نمایش کلمه عبور"}
                title={showNewPassword ? "مخفی کردن کلمه عبور" : "نمایش کلمه عبور"}
                tabIndex={-1}
              >
                {showNewPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">تکرار کلمه عبور جدید</label>
            <div className="password-input-wrapper">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="تکرار کلمه عبور جدید"
                disabled={loading}
                autoComplete="new-password"
                minLength={6}
                dir="ltr"
                className="ltr-input password-input"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? "مخفی کردن کلمه عبور" : "نمایش کلمه عبور"}
                title={showConfirmPassword ? "مخفی کردن کلمه عبور" : "نمایش کلمه عبور"}
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="primary-button login-button" disabled={loading}>
            {loading ? "در حال ثبت..." : "ثبت کلمه عبور و به‌روزرسانی"}
          </button>

          {!currentUser?.must_change_password && (
            <Link
              href={currentUser?.role === "admin" ? "/admin" : "/"}
              className="secondary-button"
              style={{
                width: "100%",
                marginTop: "8px",
                textAlign: "center",
                display: "block",
                textDecoration: "none",
                boxSizing: "border-box",
                padding: "10px 16px",
              }}
            >
              انصراف و بازگشت به سامانه
            </Link>
          )}

          <button
            type="button"
            className="secondary-button"
            style={{ width: "100%", marginTop: "8px" }}
            onClick={logout}
            disabled={loading}
          >
            خروج از حساب کاربری
          </button>
        </form>

        <div className="login-footer">
          <span>چن چند — حفظ امنیت دسترسی</span>
        </div>
      </div>
    </div>
  );
}
