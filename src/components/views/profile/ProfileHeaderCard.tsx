import React from "react";
import Link from "next/link";
import { CurrentUser } from "@/context/DashboardContext";

interface ProfileHeaderCardProps {
  currentUser: CurrentUser;
}

export function ProfileHeaderCard({ currentUser }: ProfileHeaderCardProps) {
  const roleLabel = currentUser.role === "admin" ? "مدیر کل" : "کاربر عادی";
  const userInitial = (currentUser.username?.[0] || "U").toUpperCase();

  return (
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
    </div>
  );
}
