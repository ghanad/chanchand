"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "../../context/DashboardContext";
import { UserMenu } from "./UserMenu";

interface NavItem {
  id: "products" | "runs" | "sources" | "users";
  label: string;
  subpath: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { id: "products", label: "محصولات", subpath: "/products" },
  { id: "runs", label: "اجرا و خطا", subpath: "/runs" },
  { id: "sources", label: "منابع قیمت‌گیری", subpath: "/sources", adminOnly: true },
  { id: "users", label: "مدیریت کاربران", subpath: "/users", adminOnly: true },
];

export function WorkspaceHeader() {
  const pathname = usePathname();
  const { isAdmin, runNow, isCollecting } = useDashboard();
  const basePath = isAdmin ? "/admin" : "";
  const homeHref = basePath ? `${basePath}/products` : "/products";

  function isItemActive(id: NavItem["id"], href: string): boolean {
    if (id === "products") {
      return (
        pathname === href ||
        pathname === "/products" ||
        pathname === "/admin/products" ||
        pathname === "/" ||
        pathname === "/admin" ||
        pathname.startsWith("/products/") ||
        pathname.startsWith("/admin/products/")
      );
    }
    if (id === "runs") {
      return (
        pathname === href ||
        pathname === "/runs" ||
        pathname === "/admin/runs" ||
        pathname.startsWith("/runs/") ||
        pathname.startsWith("/admin/runs/")
      );
    }
    if (id === "sources") {
      return (
        pathname === href ||
        pathname === "/sources" ||
        pathname === "/admin/sources" ||
        pathname.startsWith("/sources/") ||
        pathname.startsWith("/admin/sources/")
      );
    }
    if (id === "users") {
      return (
        pathname === href ||
        pathname === "/users" ||
        pathname === "/admin/users" ||
        pathname.startsWith("/users/") ||
        pathname.startsWith("/admin/users/")
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="top-navbar">
      <div className="top-navbar-inner">
        <div className="top-navbar-start">
          <Link href={homeHref} className="top-navbar-brand" title="چن چند - صفحه محصولات">
            <span className="brand-badge" aria-hidden="true">
              چ‌چ
            </span>
            <div className="brand-text">
              <span className="brand-title">چن چند</span>
              {isAdmin && <span className="brand-role-badge">مدیر</span>}
            </div>
          </Link>

          <nav className="top-navbar-nav" aria-label="بخش‌های اصلی سیستم">
            {navItems
              .filter((item) => !item.adminOnly || isAdmin)
              .map((item) => {
                const href = `${basePath}${item.subpath}`;
                const isActive = isItemActive(item.id, href);

                return (
                  <Link
                    key={item.id}
                    href={href}
                    className={`top-nav-link ${isActive ? "active" : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.id === "products" && (
                      <svg
                        className="top-nav-icon"
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
                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <path d="M16 10a4 4 0 0 1-8 0" />
                      </svg>
                    )}
                    {item.id === "runs" && (
                      <svg
                        className="top-nav-icon"
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
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                    )}
                    {item.id === "sources" && (
                      <svg
                        className="top-nav-icon"
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
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    )}
                    {item.id === "users" && (
                      <svg
                        className="top-nav-icon"
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
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    )}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
          </nav>
        </div>

        <div className="top-navbar-end">
          {isAdmin ? (
            <button
              className="top-navbar-run-btn"
              type="button"
              onClick={runNow}
              disabled={isCollecting}
              aria-label={isCollecting ? "در حال اجرای جمع‌آوری قیمت‌ها" : "اجرای جمع‌آوری قیمت‌ها"}
            >
              {isCollecting ? (
                <>
                  <span className="top-navbar-spinner" aria-hidden="true" />
                  <span className="btn-label">در حال اجرا...</span>
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span className="btn-label">اجرای جمع‌آوری</span>
                </>
              )}
            </button>
          ) : null}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
