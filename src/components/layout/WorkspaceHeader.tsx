"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "../../context/DashboardContext";
import { UserMenu } from "./UserMenu";

interface MainNavItem {
  id: string;
  label: string;
  href: string;
}

// User-facing service tabs config.
// Tabs are rendered only if there are > 1 items.
const mainNavItems: MainNavItem[] = [
  { id: "products", label: "محصولات", href: "/products" },
];

interface AdminNavItem {
  id: string;
  label: string;
  href: string;
}

const adminNavItems: AdminNavItem[] = [
  { id: "admin-products", label: "مدیریت محصولات", href: "/admin/products" },
  { id: "admin-runs", label: "اجرا و خطا", href: "/admin/runs" },
  { id: "admin-sources", label: "منابع قیمت‌گیری", href: "/admin/sources" },
  { id: "admin-users", label: "مدیریت کاربران", href: "/admin/users" },
];

function renderNavIcon(id: string) {
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
    case "admin-products":
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
    case "admin-runs":
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
    case "admin-sources":
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
    case "admin-users":
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
    default:
      return null;
  }
}

export function WorkspaceHeader() {
  const pathname = usePathname();
  const { isAdmin } = useDashboard();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdminDropdownOpen, setIsAdminDropdownOpen] = useState(false);

  const hamburgerBtnRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const adminDropdownRef = useRef<HTMLDivElement>(null);
  const adminDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const adminDropdownMenuRef = useRef<HTMLDivElement>(null);

  const homeHref = "/products";

  function isMainItemActive(href: string): boolean {
    if (href === "/products") {
      return (
        pathname === "/products" ||
        pathname === "/" ||
        (pathname.startsWith("/products/") && !pathname.startsWith("/admin/"))
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function isAdminItemActive(id: string): boolean {
    if (id === "admin-products") {
      return (
        pathname === "/admin" ||
        pathname === "/admin/products" ||
        pathname.startsWith("/admin/products/") ||
        pathname === "/admin/manage-products"
      );
    }
    if (id === "admin-runs") {
      return (
        pathname === "/runs" ||
        pathname === "/admin/runs" ||
        pathname.startsWith("/runs/") ||
        pathname.startsWith("/admin/runs/")
      );
    }
    if (id === "admin-sources") {
      return (
        pathname === "/sources" ||
        pathname === "/admin/sources" ||
        pathname.startsWith("/sources/") ||
        pathname.startsWith("/admin/sources/")
      );
    }
    if (id === "admin-users") {
      return (
        pathname === "/users" ||
        pathname === "/admin/users" ||
        pathname.startsWith("/users/") ||
        pathname.startsWith("/admin/users/")
      );
    }
    return false;
  }

  const isAdminSectionActive =
    pathname.startsWith("/admin") ||
    pathname === "/runs" ||
    pathname.startsWith("/runs/") ||
    pathname === "/sources" ||
    pathname.startsWith("/sources/") ||
    pathname === "/users" ||
    pathname.startsWith("/users/");

  // Close menus on route transition
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsAdminDropdownOpen(false);
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

  // Handle click outside for admin dropdown
  useEffect(() => {
    if (!isAdminDropdownOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        adminDropdownRef.current &&
        !adminDropdownRef.current.contains(event.target as Node)
      ) {
        setIsAdminDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isAdminDropdownOpen]);

  const closeAdminDropdown = useCallback(() => {
    setIsAdminDropdownOpen(false);
    adminDropdownTriggerRef.current?.focus();
  }, []);

  const openAdminDropdownAndFocus = useCallback((target: "first" | "last" = "first") => {
    setIsAdminDropdownOpen(true);
    requestAnimationFrame(() => {
      const menu = adminDropdownMenuRef.current;
      if (!menu) return;
      const items = Array.from(
        menu.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]')
      );
      if (items.length > 0) {
        const itemToFocus = target === "last" ? items[items.length - 1] : items[0];
        itemToFocus?.focus();
      }
    });
  }, []);

  // Keyboard navigation for admin dropdown
  const handleAdminMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAdminDropdown();
      return;
    }

    if (!isAdminDropdownOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openAdminDropdownAndFocus("first");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        openAdminDropdownAndFocus("last");
      }
      return;
    }

    const menu = adminDropdownMenuRef.current;
    if (!menu) return;

    const items = Array.from(
      menu.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]')
    );
    if (!items.length) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLAnchorElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[nextIndex]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prevIndex]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setIsAdminDropdownOpen(false);
    }
  };

  const showMainTabs = mainNavItems.length > 1;
  const showMobileHamburger = showMainTabs || isAdmin;

  return (
    <header className="top-navbar">
      <div className="top-navbar-inner">
        <div className="top-navbar-start">
          {/* دکمه همبرگری موبایل (فقط در صورت وجود بیش از یک تب یا کاربر مدیر) */}
          {showMobileHamburger && (
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
          )}

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

          {/* تب‌های خدمات اصلی (تنها در صورتی رندر می‌شوند که بیش از ۱ مورد باشند) */}
          {showMainTabs && (
            <nav className="top-navbar-nav" aria-label="بخش‌های اصلی سیستم">
              {mainNavItems.map((item) => {
                const isActive = isMainItemActive(item.href);
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
          )}

          {/* منوی کشویی یکپارچه مدیریت (مخصوص مدیران سیستم) */}
          {isAdmin && (
            <div
              className="top-nav-dropdown"
              ref={adminDropdownRef}
              onKeyDown={handleAdminMenuKeyDown}
            >
              <button
                ref={adminDropdownTriggerRef}
                id="admin-menu-button"
                type="button"
                className={`top-nav-link top-nav-dropdown-trigger ${
                  isAdminSectionActive ? "active" : ""
                } ${isAdminDropdownOpen ? "is-open" : ""}`}
                onClick={() => {
                  if (isAdminDropdownOpen) {
                    setIsAdminDropdownOpen(false);
                  } else {
                    openAdminDropdownAndFocus("first");
                  }
                }}
                aria-haspopup="menu"
                aria-expanded={isAdminDropdownOpen}
                aria-controls="admin-dropdown-menu"
                aria-label="منوی مدیریت سیستم"
              >
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
                <span>مدیریت</span>
                <svg
                  className={`top-nav-chevron ${isAdminDropdownOpen ? "is-open" : ""}`}
                  width="12"
                  height="12"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 7.5L10 12.5L15 7.5" />
                </svg>
              </button>

              {isAdminDropdownOpen && (
                <div
                  ref={adminDropdownMenuRef}
                  id="admin-dropdown-menu"
                  role="menu"
                  aria-orientation="vertical"
                  aria-labelledby="admin-menu-button"
                  className="admin-dropdown-menu"
                  tabIndex={-1}
                >
                  {adminNavItems.map((item) => {
                    const isActive = isAdminItemActive(item.id);
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        role="menuitem"
                        className={`admin-dropdown-item ${isActive ? "active" : ""}`}
                        aria-current={isActive ? "page" : undefined}
                        tabIndex={isAdminDropdownOpen ? 0 : -1}
                        onClick={() => setIsAdminDropdownOpen(false)}
                      >
                        {renderNavIcon(item.id)}
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="top-navbar-end">
          <UserMenu />
        </div>
      </div>

      {/* پنل عمودی کشویی ناوبری در موبایل */}
      {showMobileHamburger && isMobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          id="mobile-nav-panel"
          className="mobile-nav-panel"
          role="region"
          aria-label="منوی ناوبری موبایل"
        >
          {showMainTabs && (
            <nav className="mobile-nav-list" aria-label="ناوبری صفحات">
              {mainNavItems.map((item) => {
                const isActive = isMainItemActive(item.href);
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
          )}

          {isAdmin && (
            <div className="mobile-admin-section">
              <div className="mobile-admin-section-title">مدیریت سیستم</div>
              <nav className="mobile-nav-list" aria-label="بخش‌های مدیریت سیستم">
                {adminNavItems.map((item) => {
                  const isActive = isAdminItemActive(item.id);
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
            </div>
          )}
        </div>
      )}
    </header>
  );
}
