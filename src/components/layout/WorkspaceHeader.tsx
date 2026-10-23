"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useDashboard } from "../../context/DashboardContext";

function getPageTitle(pathname: string): string {
  const cleanPath = pathname.replace(/^\/admin/, "") || "/";
  if (cleanPath === "/") return "نمای کلی";
  if (cleanPath.startsWith("/prices")) return "قیمت‌ها";
  if (cleanPath.startsWith("/history")) return "تاریخچه";
  if (cleanPath.startsWith("/runs")) return "اجرا و خطا";
  if (cleanPath.startsWith("/products")) return "محصولات";
  if (cleanPath.startsWith("/users")) return "مدیریت کاربران";
  return "داشبورد";
}

export function WorkspaceHeader() {
  const pathname = usePathname();
  const { isAdmin, currentUser, logout, runNow, isCollecting } = useDashboard();
  const title = getPageTitle(pathname);

  return (
    <header className="workspace-header">
      <div>
        <h2>{title}</h2>
      </div>
      <div className="header-actions">
        {isAdmin ? (
          <button
            className="primary-button"
            type="button"
            onClick={runNow}
            disabled={isCollecting}
          >
            {isCollecting ? "در حال اجرا" : "اجرای جمع‌آوری"}
          </button>
        ) : null}
        {currentUser ? (
          <div className="user-profile-badge">
            <span className="user-name">{currentUser.username}</span>
            <span className={`role-pill ${currentUser.role}`}>
              {currentUser.role === "admin" ? "مدیر" : "بیننده"}
            </span>
            <button
              className="ghost-button logout-button"
              type="button"
              onClick={logout}
              title="خروج از حساب کاربری"
            >
              خروج
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
