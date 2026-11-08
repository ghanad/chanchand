import { useState, useEffect, useCallback, useMemo } from "react";
import { requestJson } from "@/lib/api-client";
import { useDashboard } from "@/context/DashboardContext";
import { UserItem } from "./types";
import { useUserKebabMenu } from "./useUserKebabMenu";
import { useUserModals } from "./useUserModals";

export function useUsersState() {
  const { currentUser, showToast, setLoading, refreshTick, triggerRefresh } = useDashboard();
  const [nowMs] = useState(() => Date.now());
  const [users, setUsers] = useState<UserItem[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "admin" | "viewer">("all");

  const adminCount = users.filter((u) => u.role === "admin").length;
  const viewerCount = users.filter((u) => u.role === "viewer").length;

  const kebab = useUserKebabMenu();
  const modals = useUserModals({
    currentUser,
    adminCount,
    setBusyAction,
    showToast,
    triggerRefresh,
  });

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

  return {
    currentUser,
    nowMs,
    users,
    busyAction,
    adminCount,
    viewerCount,
    filteredUsers,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    handleToggleRole,
    handleToggleMustChangePassword,
    ...kebab,
    ...modals,
  };
}
