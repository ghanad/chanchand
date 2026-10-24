"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "../../context/DashboardContext";
import { UserMenu } from "./UserMenu";

interface NavItem {
  id: "products" | "admin" | "runs" | "sources" | "users";
  label: string;
  href: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { id: "products", label: "محصولات", href: "/products" },
  { id: "admin", label: "مدیریت", href: "/admin/products", adminOnly: true },
  { id: "runs", label: "اجرا و خطا", href: "/admin/runs", adminOnly: true },
  { id: "sources", label: "منابع قیمت‌گیری", href: "/admin/sources", adminOnly: true },
  { id: "users", label: "مدیریت کاربران", href: "/admin/users", adminOnly: true },
];

function renderNavIcon(id: NavItem["id"]) {
  switch (id) {
    case "products":
      return (
        <svg
          className="top-nav-icon"
          width="16"
          height="16"
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
      );
    case "admin":
      return (
        <svg
          className="top-nav-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      );
    case "runs":
      return (
        <svg
          className="top-nav-icon"
          width="16"
          height="16"
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
      );
    case "sources":
      return (
        <svg
          className="top-nav-icon"
          width="16"
          height="16"
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
      );
    case "users":
      return (
        <svg
          className="top-nav-icon"
          width="16"
          height="16"
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
      );
  }
}

export function WorkspaceHeader() {
  const pathname = usePathname();
  const { isAdmin, runNow, isCollecting } = useDashboard();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const hamburgerBtnRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const homeHref = isAdmin ? "/admin/products" : "/products";

  function isItemActive(id: NavItem["id"], href: string): boolean {
    if (id === "products") {
      return (
        pathname === "/products" ||
        pathname === "/" ||
        (pathname.startsWith("/products/") && !pathname.startsWith("/admin/"))
      );
    }
    if (id === "admin") {
      return (
        pathname === "/admin" ||
        pathname === "/admin/products" ||
        pathname.startsWith("/admin/products/") ||
        pathname === "/admin/manage-products"
      );
    }
    if (id === "runs") {
      return (
        pathname === "/runs" ||
        pathname === "/admin/runs" ||
        pathname.startsWith("/runs/") ||
        pathname.startsWith("/admin/runs/")
      );
    }
    if (id === "sources") {
      return (
        pathname === "/sources" ||
        pathname === "/admin/sources" ||
        pathname.startsWith("/sources/") ||
        pathname.startsWith("/admin/sources/")
      );
    }
    if (id === "users") {
      return (
        pathname === "/users" ||
        pathname === "/admin/users" ||
        pathname.startsWith("/users/") ||
        pathname.startsWith("/admin/users/")
      );
    }
    return pathname === href;
  }

  // Close mobile drawer on route transition
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Handle escape key and click outside for mobile menu
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsMobileMenuOpen(false);
        hamburgerBtnRef.current?.focus();
      }
    }

    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(e.target as Node) &&
        hamburgerBtnRef.current &&
        !hamburgerBtnRef.current.contains(e.target as Node)
      ) {
        setIsMobileMenuOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <header className="top-navbar">
      <div className="top-navbar-inner">
        <div className="top-navbar-start">
          {/* دکمه همبرگری موبایل */}
          <button
            ref={hamburgerBtnRef}
            type="button"
            className={`top-navbar-hamburger ${isMobileMenuOpen ? "is-active" : ""}`}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label={isMobileMenuOpen ? "بستن منو" : "باز کردن منوی ناوبری"}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-nav-panel"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {isMobileMenuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>

          {/* برند همراه با نشان لوگو و پیوند به صفحه اصلی */}
          <Link
            href={homeHref}
            className="top-navbar-brand"
            title="چن چند - صفحه اصلی"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <span className="brand-logo-mark" aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </span>
            <div className="brand-text">
              <span className="brand-title">چن چند</span>
              {isAdmin && <span className="brand-role-badge">مدیر</span>}
            </div>
          </Link>

          {/* منوی ناوبری دسکتاپ */}
          <nav className="top-navbar-nav" aria-label="بخش‌های اصلی سیستم">
            {visibleNavItems.map((item) => {
              const isActive = isItemActive(item.id, item.href);

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`top-nav-link ${isActive ? "active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {renderNavIcon(item.id)}
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

      {/* پنل عمودی کشویی ناوبری در موبایل */}
      {isMobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          id="mobile-nav-panel"
          className="mobile-nav-panel"
          role="region"
          aria-label="منوی ناوبری موبایل"
        >
          <nav className="mobile-nav-list" aria-label="ناوبری صفحات">
            {visibleNavItems.map((item) => {
              const isActive = isItemActive(item.id, item.href);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`mobile-nav-link ${isActive ? "active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {renderNavIcon(item.id)}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {isAdmin && (
            <div className="mobile-nav-actions">
              <button
                type="button"
                className="top-navbar-run-btn mobile-run-btn"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  runNow();
                }}
                disabled={isCollecting}
                aria-label={isCollecting ? "در حال اجرای جمع‌آوری قیمت‌ها" : "اجرای جمع‌آوری قیمت‌ها"}
              >
                {isCollecting ? (
                  <>
                    <span className="top-navbar-spinner" aria-hidden="true" />
                    <span>در حال اجرا...</span>
                  </>
                ) : (
                  <>
                    <svg
                      width="15"
                      height="15"
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
                    <span>اجرای جمع‌آوری قیمت‌ها</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
