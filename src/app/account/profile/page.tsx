"use client";

import React from "react";
import { useDashboard } from "@/context/DashboardContext";
import {
  ProfileHeaderCard,
  ProfileInfoForm,
  ChangePasswordCard,
} from "@/components/views/profile";

export default function AccountProfilePage() {
  const { currentUser, showToast, refreshCurrentUser } = useDashboard();

  if (!currentUser) {
    return (
      <div className="account-page" dir="rtl">
        <div style={{ padding: "48px 0", textAlign: "center", fontSize: "12px", color: "var(--muted)" }}>
          در حال بارگذاری اطلاعات حساب کاربری...
        </div>
      </div>
    );
  }

  return (
    <div className="account-page" dir="rtl">
      {/* سربرگ اختصاصی صفحه پروفایل با ظاهر شکیل */}
      <ProfileHeaderCard currentUser={currentUser} />

      <div className="profile-content-container">
        {/* بخش ۱: مشخصات کاربری */}
        <ProfileInfoForm
          currentUser={currentUser}
          onRefresh={refreshCurrentUser}
          showToast={showToast}
        />

        {/* بخش ۲: تغییر کلمه عبور */}
        <ChangePasswordCard showToast={showToast} />
      </div>
    </div>
  );
}
