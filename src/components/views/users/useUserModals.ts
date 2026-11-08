import React, { useState } from "react";
import { requestJson } from "@/lib/api-client";
import { UserItem } from "./types";

interface UseUserModalsProps {
  currentUser: { id: number; role?: string } | null;
  adminCount: number;
  setBusyAction: (action: string | null) => void;
  showToast: (message: string) => void;
  triggerRefresh: () => void;
}

export function useUserModals({
  currentUser,
  adminCount,
  setBusyAction,
  showToast,
  triggerRefresh,
}: UseUserModalsProps) {
  // Add user modal state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
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
    handleCreateUser,
    handleResetPassword,
    handleConfirmDelete,
    handleChargeWallet,
  };
}
