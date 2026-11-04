import React from "react";
import { formatDate, formatNumber } from "@/lib/formatters";
import { UserItem, MenuCoords } from "./types";
import { UserSlotsCell } from "./UserSlotsCell";
import { UserKebabMenu } from "./UserKebabMenu";

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
              isBusy ? "is-loading" : ""
            }`}
            onClick={onToggleRole}
            title={
              isLastAdmin
                ? "امکان تغییر نقش آخرین مدیر سیستم وجود ندارد"
                : isAdminUser
                ? "مدیر کل (کلیک برای تبدیل به بیننده عادی)"
                : "بیننده (کلیک برای ارتقا به مدیر سیستم)"
            }
          >
            <span className="status-toggle-thumb">
              {isBusy && (
                <span className="status-toggle-spinner" aria-hidden="true" />
              )}
            </span>
          </button>
          <span
            className={`adapter-badge role-badge ${isAdminUser ? "admin" : "viewer"}`}
          >
            {isAdminUser ? "مدیر کل" : "بیننده"}
          </span>
        </div>
      </td>

      {/* ۳. وضعیت الزام کلمه عبور */}
      <td className="user-col-status">
        <div className="status-toggle-wrapper">
          <button
            type="button"
            role="switch"
            aria-checked={user.must_change_password}
            aria-label={
              user.must_change_password
                ? `غیرفعال کردن الزام تغییر رمز برای ${user.username}`
                : `فعال کردن الزام تغییر رمز برای ${user.username}`
            }
            disabled={isBusy}
            className={`status-toggle-btn ${
              user.must_change_password ? "is-active" : "is-inactive"
            } ${isBusy ? "is-loading" : ""}`}
            onClick={onToggleMustChangePassword}
            title={
              user.must_change_password
                ? "کاربر در ورود بعدی باید کلمه عبور را تغییر دهد (کلیک برای لغو الزام)"
                : "کلمه عبور معتبر است (کلیک برای الزام کاربر به تغییر رمز در ورود بعدی)"
            }
          >
            <span className="status-toggle-thumb">
              {isBusy && (
                <span className="status-toggle-spinner" aria-hidden="true" />
              )}
            </span>
          </button>
          <span
            className={`status-toggle-label ${
              user.must_change_password ? "active" : ""
            }`}
          >
            {user.must_change_password ? "تغییر اجباری" : "عادی"}
          </span>
        </div>
      </td>

      {/* ۴. کیف پول و اشتراک */}
      <td className="user-col-wallet">
        <div className="product-info-text">
          <div className="user-wallet-balance-row">
            <strong className="user-wallet-balance-value">
              {formatNumber(user.wallet_balance ?? 0)}
            </strong>
            <span className="user-wallet-balance-unit text-xs text-[var(--muted)]">
              تومان
            </span>
          </div>
          <div className="user-subscription-info text-xs">
            {user.slot_expires_at ? (
              (() => {
                const expiresMs = new Date(user.slot_expires_at).getTime();
                const diffDays = Math.ceil((expiresMs - nowMs) / (1000 * 60 * 60 * 24));
                const isExpired = diffDays <= 0;
                return (
                  <span
                    className={`user-sub-badge ${isExpired ? "text-[var(--danger)] font-medium" : "text-[var(--muted)]"}`}
                    title={`انقضا: ${formatDate(user.slot_expires_at)}`}
                  >
                    {isExpired ? "منقضی‌شده" : `${formatNumber(diffDays)} روز باقی‌مانده`}
                  </span>
                );
              })()
            ) : (
              <span className="user-sub-badge text-[var(--muted)]">پایه (بدون انقضا)</span>
            )}
          </div>
        </div>
      </td>

      {/* ۵. اسلات‌ها و ظرفیت پایش */}
      <td className="user-col-slots">
        <UserSlotsCell user={user} isAdminUser={isAdminUser} />
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
          <UserKebabMenu
            user={user}
            isCurrent={isCurrent}
            isLastAdmin={isLastAdmin}
            isKebabOpen={isKebabOpen}
            menuCoords={menuCoords}
            kebabTriggerRef={kebabTriggerRef}
            onToggleKebab={onToggleKebab}
            onCloseKebab={onCloseKebab}
            onOpenChargeWallet={onOpenChargeWallet}
            onOpenResetPassword={onOpenResetPassword}
            onOpenDelete={onOpenDelete}
          />
        </div>
      </td>
    </tr>
  );
}
