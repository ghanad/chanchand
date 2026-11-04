import React from "react";
import { createPortal } from "react-dom";
import { UserItem, MenuCoords } from "./types";

interface UserKebabMenuProps {
  user: UserItem;
  isCurrent: boolean;
  isLastAdmin: boolean;
  isKebabOpen: boolean;
  menuCoords: MenuCoords | null;
  kebabTriggerRef: (el: HTMLButtonElement | null) => void;
  onToggleKebab: () => void;
  onCloseKebab: () => void;
  onOpenChargeWallet: () => void;
  onOpenResetPassword: () => void;
  onOpenDelete: () => void;
}

export function UserKebabMenu({
  user,
  isCurrent,
  isLastAdmin,
  isKebabOpen,
  menuCoords,
  kebabTriggerRef,
  onToggleKebab,
  onCloseKebab,
  onOpenChargeWallet,
  onOpenResetPassword,
  onOpenDelete,
}: UserKebabMenuProps) {
  return (
    <div className="kebab-container">
      <button
        type="button"
        ref={kebabTriggerRef}
        className={`action-icon-button kebab-trigger ${isKebabOpen ? "open" : ""}`}
        onClick={onToggleKebab}
        aria-label={`عملیات بیشتر برای ${user.username}`}
        aria-haspopup="menu"
        aria-expanded={isKebabOpen}
        title="عملیات بیشتر"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleKebab();
          }
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
          <circle cx="5" cy="12" r="2" />
        </svg>
      </button>

      {isKebabOpen &&
        menuCoords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="kebab-menu-dropdown kebab-portal-menu"
            role="menu"
            aria-orientation="vertical"
            tabIndex={-1}
            style={{
              position: "fixed",
              top: menuCoords.openUpwards ? "auto" : `${menuCoords.top}px`,
              bottom: menuCoords.openUpwards ? `${menuCoords.bottom}px` : "auto",
              left: `${menuCoords.left}px`,
              zIndex: 9999,
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="kebab-menu-item text-[var(--primary)] font-medium"
              onClick={() => {
                onCloseKebab();
                onOpenChargeWallet();
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>شارژ کیف پول</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="kebab-menu-item"
              onClick={() => {
                onCloseKebab();
                onOpenResetPassword();
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 2l-2 2m-1.5 1.5L16 7l-1.5-1.5L13 7l-1.5-1.5L10 7 8.5 5.5 7 7l-1.5-1.5L4 7a4.24 4.24 0 0 0 6 6l10-10z" />
                <circle cx="7.5" cy="16.5" r="3.5" />
              </svg>
              <span>تغییر کلمه عبور</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="kebab-menu-item danger"
              disabled={isCurrent || isLastAdmin}
              onClick={() => {
                onCloseKebab();
                onOpenDelete();
              }}
              title={
                isCurrent
                  ? "امکان حذف حساب جاری وجود ندارد"
                  : isLastAdmin
                  ? "امکان حذف آخرین مدیر سیستم وجود ندارد"
                  : "حذف حساب کاربر"
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              <span>حذف کاربر</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
