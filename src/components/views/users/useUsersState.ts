import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { requestJson } from "@/lib/api-client";
import { useDashboard } from "@/context/DashboardContext";
import { UserItem, MenuCoords } from "./types";

export function useUsersState() {
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
      showToast(`کاربر «${userToDelete.username}» با موفقیت حذف شد.`);
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
    const rawAmt = parseInt(chargeAmount, 10);
    if (isNaN(rawAmt) || rawAmt <= 0) {
      showToast("مبلغ وارد شده معتبر نیست.");
      return;
    }

    const finalAmount = chargeOpType === "charge" ? rawAmt : -rawAmt;
    setBusyAction(`wallet:${walletUser.id}`);

    try {
      await requestJson(`/api/admin/users/${walletUser.id}/wallet`, {
        method: "POST",
        body: JSON.stringify({
          amount: finalAmount,
          description: chargeDescription.trim() || undefined,
        }),
      });
      showToast(
        `موجودی کاربر «${walletUser.username}» با موفقیت ${
          chargeOpType === "charge" ? "افزایش" : "کاهش"
        } یافت.`
      );
      setWalletUser(null);
      setChargeAmount("50000");
      setChargeDescription("");
      triggerRefresh();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در به‌روزرسانی موجودی کیف پول");
    } finally {
      setBusyAction(null);
    }
  };

  return {
    currentUser,
    nowMs,
    users,
    busyAction,
    showAddUserModal,
    setShowAddUserModal,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    newEmail,
    setNewEmail,
    newMobile,
    setNewMobile,
    newRole,
    setNewRole,
    newMustChangePassword,
    setNewMustChangePassword,
    resetUser,
    setResetUser,
    resetPasswordValue,
    setResetPasswordValue,
    resetMustChangePassword,
    setResetMustChangePassword,
    userToDelete,
    setUserToDelete,
    walletUser,
    setWalletUser,
    chargeOpType,
    setChargeOpType,
    chargeAmount,
    setChargeAmount,
    chargeDescription,
    setChargeDescription,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    activeKebabKey,
    setActiveKebabKey,
    menuCoords,
    setMenuCoords,
    kebabTriggerRefs,
    toggleKebab,
    adminCount,
    viewerCount,
    filteredUsers,
    handleCreateUser,
    handleToggleRole,
    handleToggleMustChangePassword,
    handleResetPassword,
    handleConfirmDelete,
    handleChargeWallet,
  };
}
