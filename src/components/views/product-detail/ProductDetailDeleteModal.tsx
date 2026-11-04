import React from "react";
import { Modal } from "@/components/common/Modal";

interface ProductDetailDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  productTitle: string;
  isDeleting: boolean;
}

export function ProductDetailDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  productTitle,
  isDeleting,
}: ProductDetailDeleteModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="تأیید حذف محصول"
      maxWidth="460px"
    >
      <div className="confirm-delete-box">
        <p>
          آیا از حذف محصول <strong>«{productTitle}»</strong> اطمینان دارید؟
        </p>
        <p className="confirm-delete-hint">
          این عملیات برگشت‌پذیر نیست و تمام اهداف و سوابق متصل به این محصول حذف خواهند شد.
        </p>
        <div className="modal-form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={isDeleting}
          >
            انصراف
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "در حال حذف..." : "بله، حذف شود"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
