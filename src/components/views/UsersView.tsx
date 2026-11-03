"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { requestJson } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/formatters";
import { useDashboard } from "@/context/DashboardContext";
import { Metric } from "@/components/common/Metric";
import { PanelHead } from "@/components/common/PanelHead";
import { Modal } from "@/components/common/Modal";
import { EmptyState } from "@/components/common/EmptyState";

interface UserItem {
  id: number;
  username: string;
  email: string | null;
  mobile?: string | null;
  role: "admin" | "viewer";
  must_change_password?: boolean;
  wallet_balance?: number;
  extra_slots?: number;
  created_at: string;
  updated_at: string;
}

export function UsersView() {
  const { currentUser, showToast, setLoading, refreshTick, triggerRefresh } = useDashboard();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [showAddUserModal, setShowAddUserModal] = useState(false);

  // New user form state
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "viewer">("viewer");
  const [newMustChangePassword, setNewMustChangePassword] = useState(false);

  // Reset password modal state
  const [resetUser, setResetUser] = useState<UserItem | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetMustChangePassword, setResetMustChangePassword] = useState(true);

  // Delete user modal state
  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);

  // Charge wallet modal state
  const [walletUser, setWalletUser] = useState<UserItem | null>(null);
  const [chargeOpType, setChargeOpType] = useState<"charge" | "deduct">("charge");
  const [chargeAmount, setChargeAmount] = useState<string>("50000");
  const [chargeDescription, setChargeDescription] = useState<string>("");

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "admin" | "viewer">("all");
  const [activeKebabKey, setActiveKebabKey] = useState<string | null>(null);
  const kebabTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestJson<{ users: UserItem[] }>("/api/admin/users");
      setUsers(data.users);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت لیست کاربران");
    } finally {
      setLoading(false);
    }
  }, [setLoading, showToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, refreshTick]);

  // Close kebab menu on outside click or Esc
  useEffect(() => {
    if (!activeKebabKey) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".kebab-container")) {
        setActiveKebabKey(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const lastKey = activeKebabKey;
        setActiveKebabKey(null);
        if (lastKey && kebabTriggerRefs.current[lastKey]) {
          kebabTriggerRefs.current[lastKey]?.focus();
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeKebabKey]);

  const adminCount = users.filter((u) => u.role === "admin").length;
  const viewerCount = users.filter((u) => u.role === "viewer").length;

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (statusFilter === "admin" && user.role !== "admin") return false;
      if (statusFilter === "viewer" && user.role !== "viewer") return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const matchUsername = user.username.toLowerCase().includes(q);
      const matchEmail = (user.email || "").toLowerCase().includes(q);
      const matchMobile = (user.mobile || "").toLowerCase().includes(q);
      return matchUsername || matchEmail || matchMobile;
    });
  }, [users, statusFilter, searchQuery]);

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusyAction("create");
    try {
      await requestJson("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          email: newEmail || null,
          mobile: newMobile || null,
          role: newRole,
          must_change_password: newMustChangePassword,
        }),
      });

      showToast(`کاربر «${newUsername}» با موفقیت ایجاد شد.`);
      setNewUsername("");
      setNewPassword("");
      setNewEmail("");
      setNewMobile("");
      setNewRole("viewer");
      setNewMustChangePassword(false);
      setShowAddUserModal(false);
      triggerRefresh();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در ساخت کاربر");
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleRole = async (user: UserItem) => {
    const nextRole: "admin" | "viewer" = user.role === "admin" ? "viewer" : "admin";
    if (user.role === "admin" && adminCount <= 1) {
      showToast("حداقل یک کاربر مدیر باید در سیستم فعال باشد.");
      return;
    }

    // Optimistic update
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, role: nextRole } : u))
    );
    setBusyAction(`role:${user.id}`);

    try {
      await requestJson(`/api/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ role: nextRole }),
      });
      showToast(
        `نقش کاربر «${user.username}» به ${
          nextRole === "admin" ? "مدیر کل" : "بیننده"
        } تغییر یافت.`
      );
      triggerRefresh();
    } catch (err: any) {
      // Revert on failure
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: user.role } : u))
      );
      showToast(err instanceof Error ? err.message : "خطا در تغییر نقش");
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleMustChangePassword = async (user: UserItem) => {
    const nextVal = !user.must_change_password;
    // Optimistic update
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, must_change_password: nextVal } : u))
    );
    setBusyAction(`forcepass:${user.id}`);

    try {
      await requestJson(`/api/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ must_change_password: nextVal }),
      });
      showToast(
        nextVal
          ? `الزام تغییر کلمه عبور برای «${user.username}» فعال شد.`
          : `الزام تغییر کلمه عبور برای «${user.username}» غیرفعال شد.`
      );
      triggerRefresh();
    } catch (err: any) {
      // Revert on failure
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, must_change_password: user.must_change_password } : u))
      );
      showToast(err instanceof Error ? err.message : "خطا در تغییر وضعیت الزام کلمه عبور");
    } finally {
      setBusyAction(null);
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resetUser || resetPasswordValue.length < 6) {
      showToast("کلمه عبور باید حداقل ۶ کاراکتر باشد.");
      return;
    }

    setBusyAction(`pass:${resetUser.id}`);
    try {
      await requestJson(`/api/admin/users/${resetUser.id}`, {
        method: "PUT",
        body: JSON.stringify({
          password: resetPasswordValue,
          must_change_password: resetMustChangePassword,
        }),
      });
      showToast(`کلمه عبور کاربر «${resetUser.username}» با موفقیت به‌روزرسانی شد.`);
      setResetUser(null);
      setResetPasswordValue("");
      setResetMustChangePassword(true);
      triggerRefresh();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در تغییر کلمه عبور");
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    if (currentUser?.id === userToDelete.id) {
      showToast("امکان حذف حسابی که در حال حاضر با آن وارد شده‌اید وجود ندارد.");
      return;
    }

    if (userToDelete.role === "admin" && adminCount <= 1) {
      showToast("امکان حذف آخرین مدیر سیستم وجود ندارد.");
      return;
    }

    setBusyAction(`delete:${userToDelete.id}`);
    try {
      await requestJson(`/api/admin/users/${userToDelete.id}`, {
        method: "DELETE",
      });
      showToast(`کاربر «${userToDelete.username}» حذف شد.`);
      setUserToDelete(null);
      triggerRefresh();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در حذف کاربر");
    } finally {
      setBusyAction(null);
    }
  };

  const handleChargeWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletUser) return;
    const numericAmt = Math.abs(parseInt(chargeAmount.replace(/\D/g, ""), 10) || 0);
    if (numericAmt === 0) {
      showToast("مبلغ وارد شده نمی‌تواند صفر یا خالی باشد.");
      return;
    }

    const signedAmt = chargeOpType === "charge" ? numericAmt : -numericAmt;

    setBusyAction(`wallet:${walletUser.id}`);
    try {
      const res = await requestJson<{ success: boolean; message: string; balance: number }>(
        `/api/admin/users/${walletUser.id}/wallet`,
        {
          method: "POST",
          body: JSON.stringify({
            amount: signedAmt,
            description: chargeDescription.trim() || undefined,
          }),
        }
      );
      showToast(res.message || "کیف پول با موفقیت به‌روزرسانی شد.");
      setWalletUser(null);
      loadUsers();
      triggerRefresh();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در شارژ کیف پول");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="users-page page-stack">
      <section className="panel">
        <PanelHead
          title="مدیریت کاربران سامانه"
          meta={`${formatNumber(users.length)} کاربر ثبت‌شده`}
          action={
            currentUser?.role === "admin" ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => setShowAddUserModal(true)}
              >
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
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                <span>افزودن کاربر جدید</span>
              </button>
            ) : null
          }
        />
        {/* Toolbar: Search and Role Filter */}
        <div className="product-table-toolbar">
          <div className="product-search-wrapper">
            <span className="product-search-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="product-search-input"
              placeholder="جستجو در نام کاربری، ایمیل یا موبایل..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="جستجوی کاربران"
            />
            {searchQuery && (
              <button
                type="button"
                className="product-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="پاک کردن متن جستجو"
                title="پاک کردن"
              >
                ✕
              </button>
            )}
          </div>

          <div className="status-filter-pills" role="radiogroup" aria-label="فیلتر نقش کاربران">
            <button
              type="button"
              role="radio"
              aria-checked={statusFilter === "all"}
              className={`filter-pill-btn ${statusFilter === "all" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              همه ({formatNumber(users.length)})
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={statusFilter === "admin"}
              className={`filter-pill-btn ${statusFilter === "admin" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("admin")}
            >
              مدیران ({formatNumber(adminCount)})
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={statusFilter === "viewer"}
              className={`filter-pill-btn ${statusFilter === "viewer" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("viewer")}
            >
              بینندگان ({formatNumber(viewerCount)})
            </button>
          </div>
        </div>

        {/* Compact User Table */}
        <div className="product-table-wrap">
          {users.length === 0 ? (
            <EmptyState text="هنوز هیچ کاربری در سیستم ثبت نشده است." />
          ) : filteredUsers.length === 0 ? (
            <div className="empty-filter-container">
              <p>هیچ کاربری با معیارهای جستجو یا فیلتر فعلی یافت نشد.</p>
              <button
                type="button"
                className="secondary-button compact-btn"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
              >
                پاک کردن فیلترها
              </button>
            </div>
          ) : (
            <table className="product-compact-table user-compact-table" aria-label="جدول کاربران سامانه">
              <thead>
                <tr>
                  <th scope="col">کاربر و مشخصات</th>
                  <th scope="col">نقش و سطح دسترسی</th>
                  <th scope="col">کیف پول و سهمیه</th>
                  <th scope="col">الزام تغییر رمز</th>
                  <th scope="col">تاریخ عضویت</th>
                  <th scope="col" className="th-actions">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const isCurrent = currentUser?.id === user.id;
                  const isAdminUser = user.role === "admin";
                  const isKebabOpen = activeKebabKey === String(user.id);
                  const isBusy = busyAction?.includes(String(user.id));
                  const isLastAdmin = isAdminUser && adminCount <= 1;

                  return (
                    <tr
                      key={user.id}
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
                              <strong className="user-username-text" title={user.username}>
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
                            onClick={() => handleToggleRole(user)}
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
                            {isAdminUser
                              ? "ظرفیت نامحدود"
                              : `${formatNumber(user.extra_slots ?? 0)} اسلات اضافه (${formatNumber(3 + (user.extra_slots ?? 0))} کل)`}
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
                            onClick={() => handleToggleMustChangePassword(user)}
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

                      {/* ۵. تاریخ عضویت */}
                      <td className="user-col-date">
                        <div className="product-info-text">
                          <span className="user-date-text">
                            {formatDate(user.created_at)}
                          </span>
                        </div>
                      </td>

                      {/* ۶. عملیات: شارژ کیف پول، تغییر رمز و منوی کباب */}
                      <td className="user-col-actions">
                        <div className="product-actions-cell">
                          {/* دکمه شارژ سریع کیف پول */}
                          <button
                            type="button"
                            className="action-icon-button"
                            onClick={() => {
                              setWalletUser(user);
                              setChargeOpType("charge");
                              setChargeAmount("50000");
                              setChargeDescription("");
                            }}
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
                            onClick={() => {
                              setResetUser(user);
                              setResetPasswordValue("");
                              setResetMustChangePassword(true);
                            }}
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
                              ref={(el) => {
                                kebabTriggerRefs.current[String(user.id)] = el;
                              }}
                              className={`action-icon-button kebab-trigger ${isKebabOpen ? "open" : ""}`}
                              onClick={() =>
                                setActiveKebabKey((current) =>
                                  current === String(user.id) ? null : String(user.id),
                                )
                              }
                              aria-label={`عملیات بیشتر برای ${user.username}`}
                              aria-haspopup="menu"
                              aria-expanded={isKebabOpen}
                              title="عملیات بیشتر"
                              onKeyDown={(e) => {
                                if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                                  setActiveKebabKey(String(user.id));
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

                            {isKebabOpen && (
                              <div
                                className="kebab-menu-dropdown"
                                role="menu"
                                aria-orientation="vertical"
                                tabIndex={-1}
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="kebab-menu-item text-[var(--primary)] font-medium"
                                  onClick={() => {
                                    setActiveKebabKey(null);
                                    setWalletUser(user);
                                    setChargeOpType("charge");
                                    setChargeAmount("50000");
                                    setChargeDescription("");
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
                                    setActiveKebabKey(null);
                                    setResetUser(user);
                                    setResetPasswordValue("");
                                    setResetMustChangePassword(true);
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
                                    setActiveKebabKey(null);
                                    setUserToDelete(user);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                      setActiveKebabKey(null);
                                      kebabTriggerRefs.current[String(user.id)]?.focus();
                                    }
                                  }}
                                  autoFocus
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
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Modal: Add User */}
      <Modal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        title="افزودن کاربر جدید"
      >
        <form className="modal-form" onSubmit={handleCreateUser}>
          <label>
            نام کاربری
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              autoComplete="off"
              placeholder="مثلاً: ali_manager"
              dir="ltr"
              required
              minLength={3}
              autoFocus
            />
          </label>
          <label>
            کلمه عبور
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="حداقل ۶ کاراکتر"
              dir="ltr"
              required
              minLength={6}
            />
          </label>
          <label>
            ایمیل (اختیاری)
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              dir="ltr"
            />
          </label>
          <label>
            شماره موبایل (اختیاری)
            <input
              type="tel"
              value={newMobile}
              onChange={(e) => setNewMobile(e.target.value)}
              placeholder="0912..."
              dir="ltr"
            />
          </label>
          <label>
            نقش دسترسی
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "admin" | "viewer")}
            >
              <option value="viewer">بیننده (مشاهده بدون امکان تغییر)</option>
              <option value="admin">مدیر (دسترسی کامل و تغییر تنظیمات)</option>
            </select>
          </label>
          <label className="modal-checkbox-row">
            <input
              type="checkbox"
              checked={newMustChangePassword}
              onChange={(e) => setNewMustChangePassword(e.target.checked)}
            />
            <span>اجبار به تغییر کلمه عبور در اولین ورود</span>
          </label>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowAddUserModal(false)}
              disabled={busyAction === "create"}
            >
              انصراف
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={busyAction === "create"}
            >
              {busyAction === "create" ? "در حال ایجاد..." : "افزودن کاربر"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Reset Password */}
      <Modal
        isOpen={resetUser !== null}
        onClose={() => {
          setResetUser(null);
          setResetPasswordValue("");
          setResetMustChangePassword(true);
        }}
        title={`تغییر کلمه عبور کاربر «${resetUser?.username}»`}
        maxWidth="460px"
      >
        <form className="modal-form" onSubmit={handleResetPassword}>
          <label>
            کلمه عبور جدید
            <input
              type="password"
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              placeholder="حداقل ۶ کاراکتر"
              dir="ltr"
              required
              minLength={6}
              autoFocus
            />
          </label>
          <label className="modal-checkbox-row">
            <input
              type="checkbox"
              checked={resetMustChangePassword}
              onChange={(e) => setResetMustChangePassword(e.target.checked)}
            />
            <span>اجبار به تغییر کلمه عبور در ورود بعدی</span>
          </label>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setResetUser(null);
                setResetPasswordValue("");
                setResetMustChangePassword(true);
              }}
              disabled={busyAction?.startsWith("pass:")}
            >
              انصراف
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={busyAction?.startsWith("pass:")}
            >
              {busyAction?.startsWith("pass:") ? "در حال به‌روزرسانی..." : "ذخیره کلمه عبور"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirmation Dialog */}
      <Modal
        isOpen={userToDelete !== null}
        onClose={() => setUserToDelete(null)}
        title="تأیید حذف کاربر"
        maxWidth="460px"
      >
        <div className="confirm-delete-box">
          <p>
            آیا از حذف حساب کاربر <strong>«{userToDelete?.username}»</strong> اطمینان دارید؟
          </p>
          <p className="confirm-delete-hint">
            این عملیات برگشت‌پذیر نیست و دسترسی این کاربر به سیستم به طور کامل قطع خواهد شد.
          </p>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setUserToDelete(null)}
              disabled={busyAction === `delete:${userToDelete?.id}`}
            >
              انصراف
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={handleConfirmDelete}
              disabled={busyAction === `delete:${userToDelete?.id}`}
            >
              {busyAction === `delete:${userToDelete?.id}` ? "در حال حذف..." : "حذف کاربر"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Charge Wallet Dialog */}
      <Modal
        isOpen={walletUser !== null}
        onClose={() => setWalletUser(null)}
        title={`مدیریت کیف پول: ${walletUser?.username || ""}`}
        maxWidth="480px"
      >
        {walletUser && (() => {
          const currentBalance = walletUser.wallet_balance ?? 0;
          const numericAmt = Math.abs(parseInt(chargeAmount.replace(/\D/g, ""), 10) || 0);
          const signedAmt = chargeOpType === "charge" ? numericAmt : -numericAmt;
          const resultingBalance = currentBalance + signedAmt;

          return (
            <form className="modal-form" onSubmit={handleChargeWallet}>
              {/* خلاصه اطلاعات کاربر و موجودی */}
              <div className="wallet-modal-card">
                <div className="wallet-modal-user-row">
                  <div className="wallet-modal-user-info">
                    <span className="wallet-modal-avatar">
                      {walletUser.username[0]?.toUpperCase() || "U"}
                    </span>
                    <div className="wallet-modal-user-titles">
                      <div className="wallet-modal-username">{walletUser.username}</div>
                      <span className="wallet-modal-subtext">
                        {walletUser.email || walletUser.mobile || "کاربر سامانه"}
                      </span>
                    </div>
                  </div>
                  <span className={`role-pill ${walletUser.role}`}>
                    {walletUser.role === "admin" ? "مدیر کل" : "بیننده"}
                  </span>
                </div>

                <div className="wallet-modal-stats-grid">
                  <div className="wallet-stat-box">
                    <span className="wallet-stat-label">موجودی فعلی</span>
                    <span className="wallet-stat-value highlight">
                      {formatNumber(currentBalance)} تومان
                    </span>
                  </div>
                  <div className="wallet-stat-box">
                    <span className="wallet-stat-label">ظرفیت اسلات‌ها</span>
                    <span className="wallet-stat-value">
                      {walletUser.role === "admin"
                        ? "نامحدود"
                        : `${formatNumber(3 + (walletUser.extra_slots ?? 0))} محصول`}
                    </span>
                  </div>
                </div>
              </div>

              {/* انتخاب نوع عملیات: افزایش / کاهش */}
              <div className="wallet-op-toggle" role="group" aria-label="نوع عملیات">
                <button
                  type="button"
                  className={`wallet-op-btn is-charge ${chargeOpType === "charge" ? "is-active" : ""}`}
                  onClick={() => setChargeOpType("charge")}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>افزایش اعتبار (شارژ)</span>
                </button>
                <button
                  type="button"
                  className={`wallet-op-btn is-deduct ${chargeOpType === "deduct" ? "is-active" : ""}`}
                  onClick={() => setChargeOpType("deduct")}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>کسر از موجودی</span>
                </button>
              </div>

              {/* ورودی مبلغ */}
              <label>
                <span>{chargeOpType === "charge" ? "مبلغ افزایش اعتبار" : "مبلغ کسر از موجودی"}</span>
                <div className="wallet-input-wrapper">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={chargeAmount ? formatNumber(numericAmt) : ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      setChargeAmount(digits);
                    }}
                    placeholder="مثلاً: ۵۰,۰۰۰"
                    required
                    autoFocus
                  />
                  <span className="wallet-input-suffix">تومان</span>
                </div>
              </label>

              {/* دکمه‌های مبالغ سریع */}
              <div className="wallet-quick-pills" aria-label="مبالغ سریع">
                {[50000, 100000, 200000, 500000, 1000000].map((quickAmt) => (
                  <button
                    key={quickAmt}
                    type="button"
                    className={`wallet-quick-pill ${numericAmt === quickAmt ? "is-active" : ""}`}
                    onClick={() => setChargeAmount(String(quickAmt))}
                  >
                    {chargeOpType === "charge" ? "+" : "-"}{formatNumber(quickAmt)} تومان
                  </button>
                ))}
              </div>

              {/* پیش‌نمایش زنده موجودی جدید */}
              <div className={`wallet-result-preview ${resultingBalance < 0 ? "is-negative" : ""}`}>
                <span>موجودی جدید پس از اعمال:</span>
                <strong dir="ltr">{formatNumber(resultingBalance)} تومان</strong>
              </div>

              {resultingBalance < 0 && (
                <div className="wallet-negative-warning">
                  ⚠️ توجه: با اعمال این کسر، موجودی حساب کاربر منفی خواهد شد.
                </div>
              )}

              {/* فیلد توضیحات */}
              <label>
                توضیحات تراکنش (اختیاری)
                <input
                  type="text"
                  value={chargeDescription}
                  onChange={(e) => setChargeDescription(e.target.value)}
                  placeholder="مثلاً: شارژ دستی از طریق کارت‌به‌کارت، تسویه، اصلاح موجودی..."
                />
              </label>

              {/* دکمه‌های فرم */}
              <div className="modal-form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setWalletUser(null)}
                  disabled={busyAction?.startsWith("wallet:")}
                >
                  انصراف
                </button>
                <button
                  className={chargeOpType === "charge" ? "primary-button" : "danger-button"}
                  type="submit"
                  disabled={busyAction?.startsWith("wallet:") || numericAmt === 0}
                >
                  {busyAction?.startsWith("wallet:")
                    ? "در حال ثبت..."
                    : chargeOpType === "charge"
                    ? "تأیید و افزایش اعتبار"
                    : "تأیید و کسر موجودی"}
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>
    </div>
  );
}
