import React from "react";
import { createPortal } from "react-dom";
import { formatDate, formatNumber } from "@/lib/formatters";
import { UserItem, MenuCoords } from "./types";

interface UserTableRowProps {
  user: UserItem;
  currentUserId?: number;
  adminCount: number;
  nowMs: number;
  busyAction: string | null;
  isKebabOpen: boolean;
  menuCoords: MenuCoords | null;
  kebabTriggerRef: (el: HTMLButtonElement | null) => void;
  onToggleKebab: () => void;
  onToggleRole: () => void;
  onToggleMustChangePassword: () => void;
  onOpenChargeWallet: () => void;
  onOpenResetPassword: () => void;
  onOpenDelete: () => void;
  onCloseKebab: () => void;
}

export function UserTableRow({
  user,
  currentUserId,
  adminCount,
  nowMs,
  busyAction,
  isKebabOpen,
  menuCoords,
  kebabTriggerRef,
  onToggleKebab,
  onToggleRole,
  onToggleMustChangePassword,
  onOpenChargeWallet,
  onOpenResetPassword,
  onOpenDelete,
  onCloseKebab,
}: UserTableRowProps) {
  const isCurrent = currentUserId === user.id;
  const isAdminUser = user.role === "admin";
  const isBusy = busyAction?.includes(String(user.id)) ?? false;
  const isLastAdmin = isAdminUser && adminCount <= 1;

  return (
    <tr
      className={`product-table-row user-table-row ${isAdminUser ? "is-active" : "is-inactive"}`}
    >
      {/* ۱. کاربر و مشخصات */}
      <td className="user-col-info">
        <div className="user-info-group product-info-text">
          <span className="user-avatar user-avatar-sm" aria-hidden="true">
            {user.username[0]?.toUpperCase() || "U"}
          </span>
          <div className="user-names-col">
            <div className="user-username-row">
              <strong
                className="user-username-text"
                title={`${user.username} (تاریخ عضویت: ${formatDate(user.created_at)})`}
              >
                {user.username}
              </strong>
              {isCurrent && (
                <span className="current-user-tag">(شما)</span>
              )}
            </div>
            <div className="user-contacts-sub">
              {user.email && (
                <span className="user-email-text" title={`ایمیل: ${user.email}`}>
                  {user.email}
                </span>
              )}
              {user.mobile && (
                <span className="user-mobile-text" title={`شماره تماس: ${user.mobile}`}>
                  {user.mobile}
                </span>
              )}
              {!user.email && !user.mobile && (
                <span className="user-email-text">-</span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* ۲. نقش و سطح دسترسی */}
      <td className="user-col-role">
        <div className="status-toggle-wrapper">
          <button
            type="button"
            role="switch"
            aria-checked={isAdminUser}
            aria-label={
              isAdminUser
                ? `تبدیل کاربر ${user.username} به بیننده`
                : `ارتقای کاربر ${user.username} به مدیر`
            }
            disabled={isBusy || isLastAdmin}
            className={`status-toggle-btn ${isAdminUser ? "is-active" : ""} ${
              busyAction === `role:${user.id}` ? "is-loading" : ""
            }`}
            onClick={onToggleRole}
            title={
              isLastAdmin
                ? "حداقل یک کاربر مدیر باید در سیستم فعال باشد"
                : isAdminUser
                ? "کلیک برای تبدیل به بیننده"
                : "کلیک برای ارتقا به مدیر"
            }
          >
            <span className="status-toggle-thumb">
              {busyAction === `role:${user.id}` && (
                <span className="status-toggle-spinner" aria-hidden="true" />
              )}
            </span>
          </button>
          <span className={`role-pill ${user.role}`}>
            {user.role === "admin" ? "مدیر کل" : "بیننده"}
          </span>
        </div>
      </td>

      {/* ۳. کیف پول و اسلات */}
      <td className="user-col-wallet">
        <div className="product-info-text">
          <span className="wallet-balance-val">
            {formatNumber(user.wallet_balance ?? 0)} تومان
          </span>
          <span className="wallet-slots-sub">
            {isAdminUser ? (
              "ظرفیت نامحدود"
            ) : (
              <>
                <span>{formatNumber(user.extra_slots ?? 0)} اسلات ماهانه ({formatNumber(3 + (user.extra_slots ?? 0))} کل)</span>
                {user.slot_expires_at && (
                  new Date(user.slot_expires_at).getTime() <= nowMs ? (
                    <span style={{ color: "var(--danger)", display: "block", fontSize: "11px" }}>
                      (منقضی شده)
                    </span>
                  ) : (
                    <span style={{ color: "var(--ok)", display: "block", fontSize: "11px" }}>
                      ({Math.max(1, Math.ceil((new Date(user.slot_expires_at).getTime() - nowMs) / (1000 * 60 * 60 * 24)))} روز مانده)
                    </span>
                  )
                )}
              </>
            )}
          </span>
        </div>
      </td>

      {/* ۴. الزام تغییر رمز */}
      <td className="user-col-forcepass">
        <div className="status-toggle-wrapper">
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(user.must_change_password)}
            aria-label={`تغییر الزام تغییر کلمه عبور برای ${user.username}`}
            disabled={isBusy}
            className={`status-toggle-btn ${
              user.must_change_password ? "is-active warning" : ""
            } ${busyAction === `forcepass:${user.id}` ? "is-loading" : ""}`}
            onClick={onToggleMustChangePassword}
            title={
              user.must_change_password
                ? "الزام تغییر کلمه عبور فعال است (کلیک برای غیرفعال‌سازی)"
                : "الزام تغییر کلمه عبور غیرفعال است (کلیک برای فعال‌سازی)"
            }
          >
            <span className="status-toggle-thumb">
              {busyAction === `forcepass:${user.id}` && (
                <span className="status-toggle-spinner" aria-hidden="true" />
              )}
            </span>
          </button>
          <span
            className={`status-toggle-label ${
              user.must_change_password ? "warning-label" : ""
            }`}
          >
            {user.must_change_password ? "اجباری" : "اختیاری"}
          </span>
        </div>
      </td>

      {/* ۵. مصرف اسلات‌ها */}
      <td className="user-col-slots">
        <div className="product-info-text">
          {isAdminUser ? (
            <>
              <strong className="user-slots-used font-semibold">
                {formatNumber(user.used_slots ?? 0)} محصول
              </strong>
              <span className="user-slots-detail text-xs text-[var(--muted)]">
                ظرفیت نامحدود
              </span>
            </>
          ) : (
            (() => {
              const used = user.used_slots ?? 0;
              const total = user.total_slots ?? (3 + (user.extra_slots ?? 0));
              const isFull = used >= total;
              const percent = Math.min(100, Math.round((used / Math.max(1, total)) * 100));
              return (
                <>
                  <div className="user-slots-header flex items-center gap-1">
                    <strong
                      className={`user-slots-used ${
                        isFull ? "text-[var(--danger)]" : "text-[var(--text)]"
                      }`}
                    >
                      {formatNumber(used)}
                    </strong>
                    <span className="text-xs text-[var(--muted)]">از</span>
                    <span className="text-xs text-[var(--text-secondary)] font-medium">
                      {formatNumber(total)}
                    </span>
                    <span className="text-xs text-[var(--muted)]">اسلات</span>
                    {isFull && (
                      <span className="user-slots-badge-full text-[10px] bg-[var(--danger-bg,#fee2e2)] text-[var(--danger)] px-1.5 py-0.5 rounded font-normal mr-1">
                        تکمیل
                      </span>
                    )}
                  </div>
                  <div
                    className="user-dropdown-quota-track"
                    style={{ width: "84px", marginTop: "4px" }}
                    title={`${formatNumber(used)} از ${formatNumber(total)} اسلات استفاده‌شده (${percent}٪)`}
                  >
                    <div
                      className={`user-dropdown-quota-fill ${isFull ? "is-full" : ""}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </>
              );
            })()
          )}
        </div>
      </td>

      {/* ۶. عملیات: شارژ کیف پول، تغییر رمز و منوی کباب */}
      <td className="user-col-actions">
        <div className="product-actions-cell">
          {/* دکمه شارژ سریع کیف پول */}
          <button
            type="button"
            className="action-icon-button"
            onClick={onOpenChargeWallet}
            disabled={isBusy}
            aria-label={`شارژ کیف پول ${user.username}`}
            title="شارژ کیف پول"
          >
            <svg
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
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>

          {/* دکمه تغییر کلمه عبور */}
          <button
            type="button"
            className="action-icon-button"
            onClick={onOpenResetPassword}
            disabled={isBusy}
            aria-label={`تغییر کلمه عبور ${user.username}`}
            title="تغییر کلمه عبور"
          >
            <svg
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
              <path d="M21 2l-2 2m-1.5 1.5L16 7l-1.5-1.5L13 7l-1.5-1.5L10 7 8.5 5.5 7 7l-1.5-1.5L4 7a4.24 4.24 0 0 0 6 6l10-10z" />
              <circle cx="7.5" cy="16.5" r="3.5" />
            </svg>
          </button>

          {/* منوی کباب */}
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
                    bottom: menuCoords.openUpwards
                      ? `${menuCoords.bottom}px`
                      : "auto",
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
        </div>
      </td>
    </tr>
  );
}
