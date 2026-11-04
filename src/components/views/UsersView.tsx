"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { requestJson } from "@/lib/api-client";
import { formatNumber } from "@/lib/formatters";
import { useDashboard } from "@/context/DashboardContext";
import { PanelHead } from "@/components/common/PanelHead";
import {
  UserItem,
  MenuCoords,
  UsersToolbar,
  UsersTable,
  AddUserModal,
  ResetPasswordModal,
  DeleteUserModal,
  ChargeWalletModal,
} from "./users";

export function UsersView() {
  const { currentUser, showToast, setLoading, refreshTick, triggerRefresh } = useDashboard();
  const [nowMs] = useState(() => Date.now());
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
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);
  const kebabTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const toggleKebab = useCallback(
    (userId: string) => {
      if (activeKebabKey === userId) {
        setActiveKebabKey(null);
        setMenuCoords(null);
      } else {
        const triggerEl = kebabTriggerRefs.current[userId];
        if (triggerEl) {
          const rect = triggerEl.getBoundingClientRect();
          const dropdownHeight = 140;
          const spaceBelow = window.innerHeight - rect.bottom;
          const openUpwards = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
          const menuWidth = 150;
          let left = rect.left;
          if (left + menuWidth > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - menuWidth - 8);
          }
          if (left < 8) {
            left = 8;
          }
          setMenuCoords({
            top: openUpwards ? undefined : rect.bottom + 4,
            bottom: openUpwards ? window.innerHeight - rect.top + 4 : undefined,
            left,
            openUpwards,
          });
        }
        setActiveKebabKey(userId);
      }
    },
    [activeKebabKey],
  );

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

  // Close kebab menu on outside click, Esc, scroll, or resize
  useEffect(() => {
    if (!activeKebabKey) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".kebab-container") && !target?.closest(".kebab-menu-dropdown")) {
        setActiveKebabKey(null);
        setMenuCoords(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const lastKey = activeKebabKey;
        setActiveKebabKey(null);
        setMenuCoords(null);
        if (lastKey && kebabTriggerRefs.current[lastKey]) {
          kebabTriggerRefs.current[lastKey]?.focus();
        }
      }
    }
    function handleScroll(event: Event) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(".kebab-menu-dropdown")) return;
      setActiveKebabKey(null);
      setMenuCoords(null);
    }
    function handleResize() {
      setActiveKebabKey(null);
      setMenuCoords(null);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
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

        <UsersToolbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          totalUsers={users.length}
          adminCount={adminCount}
          viewerCount={viewerCount}
        />

        <UsersTable
          users={users}
          filteredUsers={filteredUsers}
          currentUser={currentUser}
          adminCount={adminCount}
          nowMs={nowMs}
          busyAction={busyAction}
          activeKebabKey={activeKebabKey}
          menuCoords={menuCoords}
          kebabTriggerRefs={kebabTriggerRefs}
          onClearFilters={() => {
            setSearchQuery("");
            setStatusFilter("all");
          }}
          onToggleKebab={toggleKebab}
          onToggleRole={handleToggleRole}
          onToggleMustChangePassword={handleToggleMustChangePassword}
          onOpenChargeWallet={(user) => {
            setActiveKebabKey(null);
            setMenuCoords(null);
            setWalletUser(user);
            setChargeOpType("charge");
            setChargeAmount("50000");
            setChargeDescription("");
          }}
          onOpenResetPassword={(user) => {
            setActiveKebabKey(null);
            setMenuCoords(null);
            setResetUser(user);
            setResetPasswordValue("");
            setResetMustChangePassword(true);
          }}
          onOpenDelete={(user) => {
            setActiveKebabKey(null);
            setMenuCoords(null);
            setUserToDelete(user);
          }}
          onCloseKebab={() => {
            setActiveKebabKey(null);
            setMenuCoords(null);
          }}
        />
      </section>

      <AddUserModal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        onSubmit={handleCreateUser}
        username={newUsername}
        setUsername={setNewUsername}
        password={newPassword}
        setPassword={setNewPassword}
        email={newEmail}
        setEmail={setNewEmail}
        mobile={newMobile}
        setMobile={setNewMobile}
        role={newRole}
        setRole={setNewRole}
        mustChangePassword={newMustChangePassword}
        setMustChangePassword={setNewMustChangePassword}
        isBusy={busyAction === "create"}
      />

      <ResetPasswordModal
        user={resetUser}
        onClose={() => {
          setResetUser(null);
          setResetPasswordValue("");
          setResetMustChangePassword(true);
        }}
        onSubmit={handleResetPassword}
        password={resetPasswordValue}
        setPassword={setResetPasswordValue}
        mustChangePassword={resetMustChangePassword}
        setMustChangePassword={setResetMustChangePassword}
        isBusy={Boolean(busyAction?.startsWith("pass:"))}
      />

      <DeleteUserModal
        user={userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={handleConfirmDelete}
        isBusy={busyAction === `delete:${userToDelete?.id}`}
      />

      <ChargeWalletModal
        user={walletUser}
        onClose={() => setWalletUser(null)}
        onSubmit={handleChargeWallet}
        chargeOpType={chargeOpType}
        setChargeOpType={setChargeOpType}
        chargeAmount={chargeAmount}
        setChargeAmount={setChargeAmount}
        chargeDescription={chargeDescription}
        setChargeDescription={setChargeDescription}
        isBusy={Boolean(busyAction?.startsWith("wallet:"))}
      />
    </div>
  );
}
