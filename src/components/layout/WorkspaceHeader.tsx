"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "../../context/DashboardContext";
import { UserMenu } from "./UserMenu";
import {
  mainNavItems,
  isMainItemActive,
  NavIcon,
  BrandLogo,
  HeaderWalletChip,
  AdminDropdown,
  MobileNavDrawer,
} from "./header";

export function WorkspaceHeader() {
  const pathname = usePathname();
  const { isAdmin, currentUser } = useDashboard();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdminDropdownOpen, setIsAdminDropdownOpen] = useState(false);

  const hamburgerBtnRef = useRef<HTMLButtonElement>(null);

  // Close menus on route transition
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsAdminDropdownOpen(false);
  }, [pathname]);

  const openAdminDropdownAndFocus = useCallback((target: "first" | "last" = "first") => {
    setIsAdminDropdownOpen(true);
    requestAnimationFrame(() => {
      const menu = document.getElementById("admin-dropdown-menu");
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

  const showMainTabs = mainNavItems.length > 1;
  const showMobileHamburger = showMainTabs || isAdmin;

  return (
    <header className="top-navbar">
      <div className="top-navbar-inner">
        <div className="top-navbar-start">
          {/* دکمه همبرگری موبایل */}
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

          {/* برند چن چند */}
          <BrandLogo
            isAdmin={isAdmin}
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* تب‌های خدمات اصلی در صورت وجود بیش از یک مورد */}
          {showMainTabs && (
            <nav className="top-navbar-nav" aria-label="بخش‌های اصلی سیستم">
              {mainNavItems.map((item) => {
                const isActive = isMainItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`top-nav-link ${isActive ? "active" : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <NavIcon id={item.id} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}

          {/* منوی کشویی یکپارچه مدیریت */}
          {isAdmin && (
            <AdminDropdown
              pathname={pathname}
              isOpen={isAdminDropdownOpen}
              onToggle={() => {
                if (isAdminDropdownOpen) {
                  setIsAdminDropdownOpen(false);
                } else {
                  openAdminDropdownAndFocus("first");
                }
              }}
              onClose={() => setIsAdminDropdownOpen(false)}
              onOpen={openAdminDropdownAndFocus}
            />
          )}
        </div>

        <div className="top-navbar-end">
          {currentUser && (
            <HeaderWalletChip balance={currentUser.wallet_balance ?? 0} />
          )}
          <UserMenu />
        </div>
      </div>

      {/* منوی ناوبری موبایل */}
      {showMobileHamburger && (
        <MobileNavDrawer
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          showMainTabs={showMainTabs}
          isAdmin={isAdmin}
          pathname={pathname}
          hamburgerBtnRef={hamburgerBtnRef}
        />
      )}
    </header>
  );
}
