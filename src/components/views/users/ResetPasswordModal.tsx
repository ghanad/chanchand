import React from "react";
import { Modal } from "@/components/common/Modal";
import { UserItem } from "./types";

interface ResetPasswordModalProps {
  user: UserItem | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  password: string;
  setPassword: (value: string) => void;
  mustChangePassword: boolean;
  setMustChangePassword: (value: boolean) => void;
  isBusy: boolean;
}

export function ResetPasswordModal({
  user,
  onClose,
  onSubmit,
  password,
  setPassword,
  mustChangePassword,
  setMustChangePassword,
  isBusy,
}: ResetPasswordModalProps) {
  return (
    <Modal
      isOpen={user !== null}
      onClose={onClose}
      title={`تغییر کلمه عبور کاربر «${user?.username ?? ""}»`}
      maxWidth="460px"
    >
      <form className="modal-form" onSubmit={onSubmit}>
        <label>
          کلمه عبور جدید
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            checked={mustChangePassword}
            onChange={(e) => setMustChangePassword(e.target.checked)}
          />
          <span>اجبار به تغییر کلمه عبور در ورود بعدی</span>
        </label>
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
            className="primary-button"
            type="submit"
            disabled={isBusy}
          >
            {isBusy ? "در حال به‌روزرسانی..." : "ذخیره کلمه عبور"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
