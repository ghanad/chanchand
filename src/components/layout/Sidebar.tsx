"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "../../context/DashboardContext";

interface NavItem {
  id: string;
  label: string;
  subpath: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { id: "overview", label: "نمای کلی", subpath: "" },
  { id: "prices", label: "قیمت‌ها", subpath: "/prices" },
  { id: "history", label: "تاریخچه", subpath: "/history" },
  { id: "runs", label: "اجرا و خطا", subpath: "/runs" },
  { id: "products", label: "محصولات", subpath: "/products" },
  { id: "sources", label: "منابع قیمت‌گیری", subpath: "/sources" },
  { id: "users", label: "مدیریت کاربران", subpath: "/users", adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin } = useDashboard();
  const basePath = isAdmin ? "/admin" : "";

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <span className="brand-mark">PG</span>
        <div>
          <p>{isAdmin ? "پنل مدیریت سیستم" : "داشبورد قیمت"}</p>
          <h1>Price Getter</h1>
        </div>
      </div>
      <nav className="nav-list" aria-label="بخش‌های داشبورد">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
            const href = `${basePath}${item.subpath}` || "/";
            const isActive =
              item.subpath === ""
                ? pathname === (basePath || "/") || (basePath === "/admin" && pathname === "/")
                : pathname === href ||
                  pathname.startsWith(`${href}/`) ||
                  (basePath === "/admin" && (pathname === item.subpath || pathname.startsWith(`${item.subpath}/`)));

            return (
              <Link
                key={item.id}
                href={href}
                className={`nav-link ${isActive ? "active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
      </nav>
    </aside>
  );
}
