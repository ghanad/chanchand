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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await requestJson<{
        success: boolean;
        user: { id: number; username: string; role: "admin" | "viewer" };
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

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
        <div className="brand-mark large">PG</div>
        <h1>سامانه پایش قیمت</h1>
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
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">کلمه عبور</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={loading}
            autoComplete="current-password"
          />
        </div>

        <button type="submit" className="primary-button login-button" disabled={loading}>
          {loading ? "در حال ورود..." : "ورود به سامانه"}
        </button>
      </form>

      <div className="login-footer">
        <span>سیستم امن پایش و تحلیل قیمت بازارهای آنلاین</span>
      </div>
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
              <div className="brand-mark large">PG</div>
              <h1>سامانه پایش قیمت</h1>
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
