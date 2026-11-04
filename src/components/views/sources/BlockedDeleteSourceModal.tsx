import React from "react";
import { Modal } from "@/components/common/Modal";
import { SourceRow } from "@/types/dashboard";
import { formatNumber } from "@/lib/formatters";

interface BlockedDeleteSourceModalProps {
  source: SourceRow | null;
  onClose: () => void;
}

export function BlockedDeleteSourceModal({
  source,
  onClose,
}: BlockedDeleteSourceModalProps) {
  return (
    <Modal
      isOpen={source !== null}
      onClose={onClose}
      title="عدم امکان حذف منبع"
      maxWidth="460px"
    >
      <div className="confirm-delete-box">
        <p>
          امکان حذف منبع <strong>«{source?.key}»</strong> وجود ندارد.
        </p>
        <p className="confirm-delete-hint">
          این منبع در حال حاضر در{" "}
          <strong>{formatNumber(source?.target_count || 0)} هدف قیمت‌گیری</strong> فعال
          است. برای حذف این منبع، ابتدا باید اهداف یا محصولات متصل به آن را حذف یا ویرایش کنید.
        </p>
        <div className="modal-form-actions">
          <button
            className="primary-button"
            type="button"
            onClick={onClose}
          >
            متوجه شدم
          </button>
        </div>
      </div>
    </Modal>
  );
}
