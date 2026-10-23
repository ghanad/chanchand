"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "../../context/DashboardContext";

interface NavItem {
  id: string;
  label: string;
  subpath: string;
}

const navItems: NavItem[] = [
  { id: "overview", label: "نمای کلی", subpath: "" },
  { id: "prices", label: "قیمت‌ها", subpath: "/prices" },
  { id: "history", label: "تاریخچه", subpath: "/history" },
  { id: "runs", label: "اجرا و خطا", subpath: "/runs" },
  { id: "products", label: "محصولات", subpath: "/products" },
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
          <p>داشبورد محلی</p>
          <h1>Price Getter</h1>
        </div>
      </div>
      <nav className="nav-list" aria-label="بخش‌های داشبورد">
        {navItems.map((item) => {
          const href = `${basePath}${item.subpath}` || "/";
          const isActive =
            item.subpath === ""
              ? pathname === (basePath || "/")
              : pathname === href || pathname.startsWith(`${href}/`);

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
