import React from "react";
import { formatNumber } from "@/lib/formatters";
import { UserItem } from "./types";

interface UserSlotsCellProps {
  user: UserItem;
  isAdminUser: boolean;
}

export function UserSlotsCell({ user, isAdminUser }: UserSlotsCellProps) {
  if (isAdminUser) {
    return (
      <div className="product-info-text">
        <strong className="user-slots-used font-semibold">
          {formatNumber(user.used_slots ?? 0)} محصول
        </strong>
        <span className="user-slots-detail text-xs text-[var(--muted)]">
          ظرفیت نامحدود
        </span>
      </div>
    );
  }

  const used = user.used_slots ?? 0;
  const total = user.total_slots ?? (3 + (user.extra_slots ?? 0));
  const isFull = used >= total;
  const percent = Math.min(100, Math.round((used / Math.max(1, total)) * 100));

  return (
    <div className="product-info-text">
      <div className="user-slots-header flex items-center gap-1">
        <strong
          className={`user-slots-used ${
            isFull ? "text-[var(--danger)]" : "text-[var(--text)]"
          }`}
        >
          {formatNumber(used)}
        </strong>
        <span className="text-xs text-[var(--muted)]">از</span>
        <span className="text-xs text-[var(--text-secondary)] font-medium">
          {formatNumber(total)}
        </span>
        <span className="text-xs text-[var(--muted)]">اسلات</span>
        {isFull && (
          <span className="user-slots-badge-full text-[10px] bg-[var(--danger-bg,#fee2e2)] text-[var(--danger)] px-1.5 py-0.5 rounded font-normal mr-1">
            تکمیل
          </span>
        )}
      </div>
      <div
        className="user-dropdown-quota-track"
        style={{ width: "84px", marginTop: "4px" }}
        title={`${formatNumber(used)} از ${formatNumber(total)} اسلات استفاده‌شده (${percent}٪)`}
      >
        <div
          className={`user-dropdown-quota-fill ${isFull ? "is-full" : ""}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
