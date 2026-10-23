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
  return "داشبورد";
}

export function WorkspaceHeader() {
  const pathname = usePathname();
  const { isAdmin, loading, triggerRefresh, runNow, isCollecting } = useDashboard();
  const title = getPageTitle(pathname);

  return (
    <header className="workspace-header">
      <div>
        <p className="eyebrow">SQLite price intelligence</p>
        <h2>{title}</h2>
      </div>
      <div className="header-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={triggerRefresh}
          disabled={loading}
        >
          تازه‌سازی
        </button>
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
      </div>
    </header>
  );
}
