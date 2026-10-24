"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useDashboard } from "../../context/DashboardContext";

export function UserMenu() {
  const { currentUser, logout } = useDashboard();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // جایگاه آماده برای صفحات احتمالی آینده (پروفایل و تنظیمات)
  // در صورت اضافه شدن این صفحات در آینده، مقدار این متغیر به true تغییر می‌یابد
  const hasExtraNav = false;

  // بستن با کلید Escape و بازگشت فوکوس به دکمه اصلی
  const closeMenu = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  // باز کردن منو و انتقال فوکوس به آیتم اول یا آخر برای دسترسی‌پذیری صفحه‌خوان و کیبورد
  const openMenuAndFocus = useCallback((target: "first" | "last" = "first") => {
    setIsOpen(true);
    requestAnimationFrame(() => {
      const menu = menuRef.current;
      if (!menu) return;
      const items = Array.from(
        menu.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(
          '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])'
        )
      );
      if (items.length > 0) {
        const itemToFocus = target === "last" ? items[items.length - 1] : items[0];
        itemToFocus?.focus();
      }
    });
  }, []);

  // بستن منو با کلیک در بیرون از کامپوننت
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // مدیریت کلیدهای کیبورد (Escape, Tab, Arrows, Home, End, Enter, Space)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      return;
    }

    // اگر منو بسته است و کلید بازکننده زده شد
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenuAndFocus("first");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        openMenuAndFocus("last");
      }
      return;
    }

    const menu = menuRef.current;
    if (!menu) return;

    const items = Array.from(
      menu.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(
        '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])'
      )
    );
    if (!items.length) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

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
      // بستن منو در صورت جابجایی فوکوس با Tab به بیرون منو
      setIsOpen(false);
    }
  };

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
  };

  if (!currentUser) return null;

  const displayName =
    (currentUser as any).displayName ||
    (currentUser as any).display_name ||
    currentUser.username;

  const firstChar = (Array.from(String(displayName).trim()) as string[])[0] || "ک";
  const initialLetter = firstChar.toUpperCase();
  const roleLabel = currentUser.role === "admin" ? "مدیر سیستم" : "کاربر عادی";

  return (
    <div
      className="user-menu-container"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        id="user-menu-button"
        type="button"
        className={`user-menu-trigger ${isOpen ? "is-open" : ""}`}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
          } else {
            openMenuAndFocus("first");
          }
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="user-dropdown-menu"
        aria-label={`منوی حساب کاربری ${displayName}`}
      >
        <span className="user-avatar user-avatar-sm" aria-hidden="true">
          {initialLetter}
        </span>
        <span className="user-menu-name" title={displayName}>{displayName}</span>
        <svg
          className={`user-menu-chevron ${isOpen ? "is-open" : ""}`}
          width="14"
          height="14"
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

      {isOpen && (
        <div
          ref={menuRef}
          id="user-dropdown-menu"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu-button"
          className="user-dropdown-menu"
          tabIndex={-1}
        >
          {/* بخش بالای منو: آواتار، نام و نقش کاربر */}
          <div className="user-dropdown-header">
            <span className="user-avatar user-avatar-lg" aria-hidden="true">
              {initialLetter}
            </span>
            <div className="user-dropdown-info">
              <span className="user-dropdown-name">{displayName}</span>
              <span className="user-dropdown-role">{roleLabel}</span>
              {currentUser.email ? (
                <span className="user-dropdown-email">{currentUser.email}</span>
              ) : null}
            </div>
          </div>

          <div className="user-dropdown-divider" role="separator" />

          {/* گزینه‌های منو */}
          <div className="user-dropdown-group" role="group">
            {/* گزینه پروفایل / تنظیمات (غیرفعال با راهنمای به‌زودی) */}
            <div
              role="menuitem"
              aria-disabled="true"
              className="user-dropdown-item is-disabled"
              title="به‌زودی"
              tabIndex={-1}
            >
              <svg
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
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>پروفایل و تنظیمات</span>
              <span className="user-dropdown-badge">به‌زودی</span>
            </div>

            {/* گزینه تغییر کلمه عبور */}
            <Link
              href="/change-password"
              role="menuitem"
              className="user-dropdown-item"
              tabIndex={isOpen ? 0 : -1}
              onClick={() => setIsOpen(false)}
            >
              <svg
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
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>تغییر کلمه عبور</span>
            </Link>
          </div>

          <div className="user-dropdown-divider" role="separator" />

          {/* گزینه خروج */}
          <button
            type="button"
            role="menuitem"
            className="user-dropdown-item user-dropdown-logout"
            tabIndex={isOpen ? 0 : -1}
            onClick={handleLogout}
          >
            <svg
              className="user-logout-icon"
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
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>خروج از حساب</span>
          </button>
        </div>
      )}
    </div>
  );
}
