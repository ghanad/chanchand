import React from "react";
import { Modal } from "@/components/common/Modal";

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  mobile: string;
  setMobile: (value: string) => void;
  role: "admin" | "viewer";
  setRole: (value: "admin" | "viewer") => void;
  mustChangePassword: boolean;
  setMustChangePassword: (value: boolean) => void;
  isBusy: boolean;
}

export function AddUserModal({
  isOpen,
  onClose,
  onSubmit,
  username,
  setUsername,
  password,
  setPassword,
  email,
  setEmail,
  mobile,
  setMobile,
  role,
  setRole,
  mustChangePassword,
  setMustChangePassword,
  isBusy,
}: AddUserModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="افزودن کاربر جدید"
    >
      <form className="modal-form" onSubmit={onSubmit}>
        <label>
          نام کاربری
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            dir="ltr"
          />
        </label>
        <label>
          شماره موبایل (اختیاری)
          <input
            type="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="0912..."
            dir="ltr"
          />
        </label>
        <label>
          نقش دسترسی
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "viewer")}
          >
            <option value="viewer">بیننده (مشاهده بدون امکان تغییر)</option>
            <option value="admin">مدیر (دسترسی کامل و تغییر تنظیمات)</option>
          </select>
        </label>
        <label className="modal-checkbox-row">
          <input
            type="checkbox"
            checked={mustChangePassword}
            onChange={(e) => setMustChangePassword(e.target.checked)}
          />
          <span>اجبار به تغییر کلمه عبور در اولین ورود</span>
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
            {isBusy ? "در حال ایجاد..." : "افزودن کاربر"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
