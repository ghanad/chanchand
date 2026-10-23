"use client";

import React, { useState } from "react";
import { requestJson } from "@/lib/api-client";
import { useDashboard } from "@/context/DashboardContext";

export default function ChangePasswordPage() {
  const { showToast, logout } = useDashboard();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
          <div className="brand-mark large">PG</div>
          <h1>تغییر کلمه عبور اجباری</h1>
          <p className="login-subtitle">
            به دستور مدیر سیستم، برای استفاده از سامانه باید کلمه عبور جدید تعیین کنید.
          </p>
        </div>

        {error && <div className="login-alert error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="newPassword">کلمه عبور جدید</label>
            <input
              id="newPassword"
              type="password"
              required
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="حداقل ۶ کاراکتر"
              disabled={loading}
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">تکرار کلمه عبور جدید</label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="تکرار کلمه عبور جدید"
              disabled={loading}
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <button type="submit" className="primary-button login-button" disabled={loading}>
            {loading ? "در حال ثبت..." : "ثبت کلمه عبور و ورود به سامانه"}
          </button>

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
          <span>سامانه پایش قیمت — حفظ امنیت دسترسی</span>
        </div>
      </div>
    </div>
  );
}
