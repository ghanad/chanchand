import React from "react";
import { Modal } from "@/components/common/Modal";
import { UserItem } from "./types";

interface DeleteUserModalProps {
  user: UserItem | null;
  onClose: () => void;
  onConfirm: () => void;
  isBusy: boolean;
}

export function DeleteUserModal({
  user,
  onClose,
  onConfirm,
  isBusy,
}: DeleteUserModalProps) {
  return (
    <Modal
      isOpen={user !== null}
      onClose={onClose}
      title="تأیید حذف کاربر"
      maxWidth="460px"
    >
      <div className="confirm-delete-box">
        <p>
          آیا از حذف حساب کاربر <strong>«{user?.username}»</strong> اطمینان دارید؟
        </p>
        <p className="confirm-delete-hint">
          این عملیات برگشت‌پذیر نیست و دسترسی این کاربر به سیستم به طور کامل قطع خواهد شد.
        </p>
        <div className="modal-form-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onClose}
            disabled={isBusy}
          >
            انصراف
          </button>
          <button
            className="danger-button"
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy ? "در حال حذف..." : "حذف کاربر"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
