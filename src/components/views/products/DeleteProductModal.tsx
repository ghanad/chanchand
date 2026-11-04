import React from "react";
import { Modal } from "../../common/Modal";
import { ProductRow } from "../../../types/dashboard";

interface DeleteProductModalProps {
  product: ProductRow | null;
  onClose: () => void;
  onConfirm: () => void;
  isBusy: boolean;
}

export function DeleteProductModal({
  product,
  onClose,
  onConfirm,
  isBusy,
}: DeleteProductModalProps) {
  return (
    <Modal
      isOpen={product !== null}
      onClose={onClose}
      title="تأیید حذف محصول"
      maxWidth="460px"
    >
      <div className="confirm-delete-box">
        <p>
          آیا از حذف محصول <strong>«{product?.title}»</strong> اطمینان دارید؟
        </p>
        <p className="confirm-delete-hint">
          این عملیات برگشت‌پذیر نیست و اهداف و داده‌های مرتبط با این محصول حذف خواهند شد.
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
            {isBusy ? "در حال حذف..." : "حذف محصول"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
