import React, { useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { NavIcon } from "./NavIcon";
import { adminNavItems, isAdminItemActive } from "./types";

interface AdminDropdownProps {
  pathname: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpen: (focusTarget?: "first" | "last") => void;
}

export function AdminDropdown({
  pathname,
  isOpen,
  onToggle,
  onClose,
  onOpen,
}: AdminDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const closeAndFocusTrigger = useCallback(() => {
    onClose();
    triggerRef.current?.focus();
  }, [onClose]);

  // Keyboard navigation for admin dropdown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAndFocusTrigger();
      return;
    }

    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen("first");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onOpen("last");
      }
      return;
    }

    const menu = menuRef.current;
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
      onClose();
    }
  };

  return (
    <div
      className="top-nav-dropdown"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        id="admin-menu-button"
        type="button"
        className={`top-nav-link top-nav-dropdown-trigger ${
          isOpen ? "is-open" : ""
        }`}
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
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
          className={`top-nav-chevron ${isOpen ? "is-open" : ""}`}
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

      {isOpen && (
        <div
          ref={menuRef}
          id="admin-dropdown-menu"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="admin-menu-button"
          className="admin-dropdown-menu"
          tabIndex={-1}
        >
          {adminNavItems.map((item) => {
            const isActive = isAdminItemActive(pathname, item.id);
            return (
              <Link
                key={item.id}
                href={item.href}
                role="menuitem"
                className={`admin-dropdown-item ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                tabIndex={isOpen ? 0 : -1}
                onClick={onClose}
              >
                <NavIcon id={item.id} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
