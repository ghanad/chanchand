"use client";

import React, { useEffect, useState, useCallback } from "react";
import { requestJson } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/formatters";
import { useDashboard } from "@/context/DashboardContext";
import { Metric } from "@/components/common/Metric";
import { PanelHead } from "@/components/common/PanelHead";
import { StatusPill } from "@/components/common/StatusPill";
import { Modal } from "@/components/common/Modal";

interface UserItem {
  id: number;
  username: string;
  email: string | null;
  role: "admin" | "viewer";
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

  // Edit password modal/state
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");

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

  const adminCount = users.filter((u) => u.role === "admin").length;
  const viewerCount = users.filter((u) => u.role === "viewer").length;

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
        }),
      });

      showToast(`کاربر «${newUsername}» با موفقیت ایجاد شد.`);
      setNewUsername("");
      setNewPassword("");
      setNewEmail("");
      setNewRole("viewer");
      setShowAddUserModal(false);
      triggerRefresh();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در ساخت کاربر");
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleRole = async (user: UserItem) => {
    const nextRole = user.role === "admin" ? "viewer" : "admin";
    if (user.role === "admin" && adminCount <= 1) {
      showToast("حداقل یک کاربر مدیر باید در سیستم فعال باشد.");
      return;
    }

    setBusyAction(`role:${user.id}`);
    try {
      await requestJson(`/api/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ role: nextRole }),
      });
      showToast(`نقش کاربر «${user.username}» به ${nextRole === "admin" ? "مدیر" : "بیننده"} تغییر یافت.`);
      triggerRefresh();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در تغییر نقش");
    } finally {
      setBusyAction(null);
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resetUserId || resetPasswordValue.length < 6) {
      showToast("کلمه عبور باید حداقل ۶ کاراکتر باشد.");
      return;
    }

    setBusyAction(`pass:${resetUserId}`);
    try {
      await requestJson(`/api/admin/users/${resetUserId}`, {
        method: "PUT",
        body: JSON.stringify({ password: resetPasswordValue }),
      });
      showToast("کلمه عبور با موفقیت به‌روزرسانی شد.");
      setResetUserId(null);
      setResetPasswordValue("");
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در تغییر کلمه عبور");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteUser = async (user: UserItem) => {
    if (currentUser?.id === user.id) {
      showToast("امکان حذف حسابی که در حال حاضر با آن وارد شده‌اید وجود ندارد.");
      return;
    }

    if (user.role === "admin" && adminCount <= 1) {
      showToast("امکان حذف آخرین مدیر سیستم وجود ندارد.");
      return;
    }

    const confirmed = window.confirm(`آیا از حذف کاربر «${user.username}» اطمینان دارید؟`);
    if (!confirmed) return;

    setBusyAction(`delete:${user.id}`);
    try {
      await requestJson(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      showToast(`کاربر «${user.username}» حذف شد.`);
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
          <div className="product-list">
            {users.map((user) => {
              const isCurrent = currentUser?.id === user.id;
              const isResetting = resetUserId === user.id;
              const isBusy = busyAction?.includes(String(user.id));

              return (
                <article className="product-row" key={user.id}>
                  <div className="product-main">
                    <div className="product-title-row">
                      <strong>
                        {user.username} {isCurrent && <span className="current-user-tag">(حساب شما)</span>}
                      </strong>
                      <StatusPill
                        text={user.role === "admin" ? "مدیر کل" : "بیننده"}
                        tone={user.role === "admin" ? "in_stock" : "unknown"}
                      />
                    </div>
                    {user.email && <span className="product-url">{user.email}</span>}
                    <div className="source-chip-row">
                      <span className="source-chip muted-chip">
                        عضویت: {formatDate(user.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="product-meta">
                    {isResetting ? (
                      <form className="inline-reset-form" onSubmit={handleResetPassword}>
                        <input
                          type="password"
                          value={resetPasswordValue}
                          onChange={(e) => setResetPasswordValue(e.target.value)}
                          placeholder="رمز جدید (حداقل ۶)"
                          autoFocus
                          required
                          minLength={6}
                        />
                        <button className="primary-button" type="submit" disabled={isBusy}>
                          ثبت
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => {
                            setResetUserId(null);
                            setResetPasswordValue("");
                          }}
                        >
                          لغو
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setResetUserId(user.id)}
                          disabled={isBusy}
                        >
                          تغییر رمز
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => handleToggleRole(user)}
                          disabled={isBusy || (user.role === "admin" && adminCount <= 1)}
                          title={user.role === "admin" ? "تبدیل به بیننده" : "ارتقا به مدیر"}
                        >
                          {user.role === "admin" ? "تبدیل به بیننده" : "ارتقا به مدیر"}
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => handleDeleteUser(user)}
                          disabled={isBusy || isCurrent || (user.role === "admin" && adminCount <= 1)}
                        >
                          حذف
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
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
    </div>
  );
}
