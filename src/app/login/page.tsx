"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { requestJson } from "@/lib/api-client";
import { useDashboard } from "@/context/DashboardContext";
import { sanitizeInternalRedirect } from "@/lib/redirect";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useDashboard();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await requestJson<{
        success: boolean;
        user: { id: number; username: string; role: "admin" | "viewer"; must_change_password?: boolean };
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      if (response.user.must_change_password) {
        showToast("لطفاً کلمه عبور جدید خود را تعیین نمایید.");
        window.location.href = "/change-password";
        return;
      }

      showToast(`خوش آمدید، ${response.user.username}`);

      const rawRedirect = searchParams.get("redirect");
      const defaultTarget = response.user.role === "admin" ? "/admin" : "/";
      const redirectPath = sanitizeInternalRedirect(rawRedirect, defaultTarget);
      window.location.href = redirectPath;
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "خطا در ورود به سیستم");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-card">
      <div className="login-brand">
        <h1>چن چند</h1>
        <p className="login-subtitle">ورود به حساب کاربری</p>
      </div>

      {error && <div className="login-alert error">{error}</div>}

      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label htmlFor="username">نام کاربری</label>
          <input
            id="username"
            type="text"
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="نام کاربری خود را وارد کنید"
            disabled={loading}
            autoComplete="username"
            dir="ltr"
            className="ltr-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">کلمه عبور</label>
          <div className="password-input-wrapper">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              autoComplete="current-password"
              dir="ltr"
              className="ltr-input password-input"
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "مخفی کردن کلمه عبور" : "نمایش کلمه عبور"}
              title={showPassword ? "مخفی کردن کلمه عبور" : "نمایش کلمه عبور"}
              tabIndex={-1}
            >
              {showPassword ? (
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
          {loading ? "در حال ورود..." : "ورود به سامانه"}
        </button>
      </form>

    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="login-container">
      <Suspense
        fallback={
          <div className="login-card">
            <div className="login-brand">
              <h1>چن چند</h1>
              <p className="login-subtitle">در حال بارگذاری فرم ورود...</p>
            </div>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
