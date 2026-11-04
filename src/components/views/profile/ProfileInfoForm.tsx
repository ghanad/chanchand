import React, { useState, useEffect } from "react";
import { CurrentUser } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";
import { PanelHead } from "@/components/common/PanelHead";

interface ProfileInfoFormProps {
  currentUser: CurrentUser;
  onRefresh: () => Promise<void>;
  showToast: (msg: string) => void;
}

export function ProfileInfoForm({ currentUser, onRefresh, showToast }: ProfileInfoFormProps) {
  const [email, setEmail] = useState(currentUser.email || "");
  const [mobile, setMobile] = useState(currentUser.mobile || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setEmail(currentUser.email || "");
    setMobile(currentUser.mobile || "");
  }, [currentUser]);

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
      await onRefresh();
    } catch (err: any) {
      setProfileMessage({
        type: "error",
        text: err instanceof Error ? err.message : "خطا در ذخیره اطلاعات",
      });
    } finally {
      setProfileSaving(false);
    }
  }

  return (
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
  );
}
