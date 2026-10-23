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
  role: "admin" | "viewer";
  must_change_password?: boolean;
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
  const [newRole, setNewRole] = useState<"admin" | "viewer">("viewer");
  const [newMustChangePassword, setNewMustChangePassword] = useState(false);

  // Reset password modal state
  const [resetUser, setResetUser] = useState<UserItem | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetMustChangePassword, setResetMustChangePassword] = useState(true);

  // Delete user modal state
  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);

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
      return matchUsername || matchEmail;
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
          role: newRole,
          must_change_password: newMustChangePassword,
        }),
      });

      showToast(`کاربر «${newUsername}» با موفقیت ایجاد شد.`);
      setNewUsername("");
      setNewPassword("");
      setNewEmail("");
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

  return (
    <div className="users-page">
      <section className="product-summary-grid" aria-label="خلاصه آمار کاربران">
        <Metric label="کل کاربران" value={formatNumber(users.length)} />
        <Metric label="مدیران سیستم" value={formatNumber(adminCount)} />
        <Metric label="کاربران بیننده" value={formatNumber(viewerCount)} />
        <Metric label="حساب جاری" value={currentUser?.username || "-"} />
      </section>

      <div className="product-grid">
        {/* Users list panel */}
        <section className="panel product-list-panel">
          <PanelHead
            title="کاربران ثبت‌شده در پایگاه داده"
            meta={`${formatNumber(users.length)} کاربر`}
            action={
              currentUser?.role === "admin" ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setShowAddUserModal(true)}
                >
                  + افزودن کاربر جدید
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
                placeholder="جستجو در نام کاربری یا ایمیل..."
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
              <table className="product-compact-table user-compact-table" aria-label="جدول کاربران">
                <thead>
                  <tr>
                    <th scope="col">کاربر و مشخصات</th>
                    <th scope="col">نقش کاربری</th>
                    <th scope="col">دسترسی مدیریت</th>
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
                              <span className="user-email-text">
                                {user.email || "-"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* ۲. نقش کاربری */}
                        <td className="user-col-role">
                          <div className="product-info-text">
                            <span className={`role-pill ${user.role}`}>
                              {user.role === "admin" ? "مدیر کل" : "بیننده"}
                            </span>
                          </div>
                        </td>

                        {/* ۳. سوئیچ دسترسی مدیریت */}
                        <td className="user-col-toggle">
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
                                {isBusy && (
                                  <span className="status-toggle-spinner" aria-hidden="true" />
                                )}
                              </span>
                            </button>
                            <span className={`status-toggle-label ${isAdminUser ? "active" : ""}`}>
                              {isAdminUser ? "مدیر" : "بیننده"}
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

                        {/* ۵. عملیات: تغییر رمز و حذف */}
                        <td className="user-col-actions">
                          <div className="product-actions-cell">
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
      </div>

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
    </div>
  );
}
