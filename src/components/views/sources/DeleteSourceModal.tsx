import React from "react";
import { Modal } from "@/components/common/Modal";
import { SourceRow } from "@/types/dashboard";

interface DeleteSourceModalProps {
  source: SourceRow | null;
  onClose: () => void;
  onConfirm: () => void;
  isBusy: boolean;
}

export function DeleteSourceModal({
  source,
  onClose,
  onConfirm,
  isBusy,
}: DeleteSourceModalProps) {
  return (
    <Modal
      isOpen={source !== null}
      onClose={onClose}
      title="تأیید حذف منبع"
      maxWidth="460px"
    >
      <div className="confirm-delete-box">
        <p>
          آیا از حذف منبع <strong>«{source?.key}»</strong> اطمینان دارید؟
        </p>
        <p className="confirm-delete-hint">
          این عملیات برگشت‌پذیر نیست و این منبع از سیستم حذف خواهد شد.
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
            {isBusy ? "در حال حذف..." : "حذف منبع"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
