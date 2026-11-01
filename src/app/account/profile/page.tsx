"use client";

import React, { useState, useEffect } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";
import { PanelHead } from "@/components/common/PanelHead";

export default function AccountProfilePage() {
  const { currentUser, showToast, refreshCurrentUser } = useDashboard();
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (currentUser) {
      setEmail(currentUser.email || "");
      setMobile(currentUser.mobile || "");
    }
  }, [currentUser]);

  if (!currentUser) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await requestJson<{ success: boolean; message: string }>("/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({ email, mobile }),
      });
      setMessage({ type: "success", text: res.message || "اطلاعات با موفقیت ذخیره شد." });
      showToast("مشخصات حساب ذخیره شد.");
      await refreshCurrentUser();
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "خطا در ذخیره اطلاعات",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="panel p-6 space-y-5">
        <PanelHead title="مشخصات کاربری" meta="مدیریت آدرس ایمیل و شماره موبایل" />

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
              disabled={saving}
              className="btn btn-primary text-xs w-full py-2.5 font-bold"
            >
              {saving ? "در حال ذخیره..." : "ذخیره تغییرات مشخصات"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
