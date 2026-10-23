"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
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

  // بستن با کلید Escape و بازگشت فوکوس به دکمه اصلی
  const closeMenu = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  // مدیریت کلیدهای کیبورد (Escape, Tab, Arrows, Home, End)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      return;
    }

    if (!isOpen) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const menu = menuRef.current;
    if (!menu) return;

    const items = Array.from(
      menu.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(
        '[role="menuitem"]:not([disabled])'
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
      // بستن منو در صورت جابجایی فوکوس به بیرون
      setIsOpen(false);
    }
  };

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
  };

  if (!currentUser) return null;

  const initialLetter = (currentUser.username?.trim().charAt(0) || "ک").toUpperCase();
  const roleLabel = currentUser.role === "admin" ? "مدیر" : "بیننده";

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
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="user-dropdown-menu"
        aria-label={`منوی حساب کاربری ${currentUser.username}`}
      >
        <span className="user-avatar user-avatar-sm" aria-hidden="true">
          {initialLetter}
        </span>
        <span className="user-menu-name">{currentUser.username}</span>
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
          {/* بخش بالای منو: آواتار بزرگتر، نام کاربر و نشان نقش */}
          <div className="user-dropdown-header">
            <span className="user-avatar user-avatar-lg" aria-hidden="true">
              {initialLetter}
            </span>
            <div className="user-dropdown-info">
              <span className="user-dropdown-name">{currentUser.username}</span>
              {currentUser.email ? (
                <span className="user-dropdown-email">{currentUser.email}</span>
              ) : null}
              <div>
                <span className={`role-pill ${currentUser.role}`}>
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="user-dropdown-divider" role="separator" />

          {/* جایگاه آماده برای پیوندهای پروفایل و تنظیمات (در حال حاضر غیرفعال) */}
          {hasExtraNav && (
            <>
              <div className="user-dropdown-group" role="group">
                <button
                  type="button"
                  role="menuitem"
                  className="user-dropdown-item"
                  tabIndex={isOpen ? 0 : -1}
                  onClick={() => {
                    setIsOpen(false);
                    // router.push("/profile");
                  }}
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
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>پروفایل کاربری</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="user-dropdown-item"
                  tabIndex={isOpen ? 0 : -1}
                  onClick={() => {
                    setIsOpen(false);
                    // router.push("/settings");
                  }}
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
                  <span>تنظیمات</span>
                </button>
              </div>

              <div className="user-dropdown-divider" role="separator" />
            </>
          )}

          {/* گزینه خروج با آیکون و رنگ قرمز ملایم */}
          <button
            type="button"
            role="menuitem"
            className="user-dropdown-item user-dropdown-logout"
            tabIndex={isOpen ? 0 : -1}
            onClick={handleLogout}
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
