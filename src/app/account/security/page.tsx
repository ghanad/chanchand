"use client";

import React, { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";
import { PanelHead } from "@/components/common/PanelHead";

export default function AccountSecurityPage() {
  const { showToast } = useDashboard();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 6) {
      setMessage({ type: "error", text: "کلمه عبور باید حداقل ۶ کاراکتر باشد." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "کلمه عبور جدید و تکرار آن یکسان نیستند." });
      return;
    }

    setSaving(true);
    try {
      const res = await requestJson<{ success: boolean; message: string }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });
      setMessage({ type: "success", text: res.message || "کلمه عبور با موفقیت به‌روزرسانی شد." });
      setNewPassword("");
      setConfirmPassword("");
      showToast("کلمه عبور تغییر یافت.");
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "خطا در تغییر کلمه عبور",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="panel p-6 space-y-5">
        <PanelHead title="امنیت حساب" meta="تغییر کلمه عبور حساب کاربری" />

        {message && (
          <div
            className={`p-3 rounded-lg text-xs ${
              message.type === "success"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20"
            }`}
            role="alert"
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              disabled={saving}
              className="btn btn-secondary text-xs w-full py-2.5 font-bold"
            >
              {saving ? "در حال به‌روزرسانی..." : "به‌روزرسانی کلمه عبور"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
