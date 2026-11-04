import React, { useRef, useEffect } from "react";
import Link from "next/link";
import { NavIcon } from "./NavIcon";
import {
  mainNavItems,
  adminNavItems,
  isMainItemActive,
  isAdminItemActive,
} from "./types";

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  showMainTabs: boolean;
  isAdmin: boolean;
  pathname: string;
  hamburgerBtnRef: React.RefObject<HTMLButtonElement | null>;
}

export function MobileNavDrawer({
  isOpen,
  onClose,
  showMainTabs,
  isAdmin,
  pathname,
  hamburgerBtnRef,
}: MobileNavDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle escape key and click outside for mobile menu
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        hamburgerBtnRef.current?.focus();
      }
    }

    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        hamburgerBtnRef.current &&
        !hamburgerBtnRef.current.contains(e.target as Node)
      ) {
        onClose();
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
  }, [isOpen, onClose, hamburgerBtnRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      id="mobile-nav-panel"
      className="mobile-nav-panel"
      role="region"
      aria-label="منوی ناوبری موبایل"
    >
      {showMainTabs && (
        <nav className="mobile-nav-list" aria-label="ناوبری صفحات">
          {mainNavItems.map((item) => {
            const isActive = isMainItemActive(pathname, item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`mobile-nav-link ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={onClose}
              >
                <NavIcon id={item.id} />
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
              const isActive = isAdminItemActive(pathname, item.id);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`mobile-nav-link ${isActive ? "active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={onClose}
                >
                  <NavIcon id={item.id} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
