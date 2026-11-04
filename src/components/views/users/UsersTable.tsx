import React from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { UserItem, MenuCoords } from "./types";
import { UserTableRow } from "./UserTableRow";

interface UsersTableProps {
  users: UserItem[];
  filteredUsers: UserItem[];
  currentUser: { id: number; username: string; role: string } | null;
  adminCount: number;
  nowMs: number;
  busyAction: string | null;
  activeKebabKey: string | null;
  menuCoords: MenuCoords | null;
  kebabTriggerRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onClearFilters: () => void;
  onToggleKebab: (key: string, btn: HTMLButtonElement | null) => void;
  onToggleRole: (user: UserItem) => void;
  onToggleMustChangePassword: (user: UserItem) => void;
  onOpenChargeWallet: (user: UserItem) => void;
  onOpenResetPassword: (user: UserItem) => void;
  onOpenDelete: (user: UserItem) => void;
  onCloseKebab: () => void;
}

export function UsersTable({
  users,
  filteredUsers,
  currentUser,
  adminCount,
  nowMs,
  busyAction,
  activeKebabKey,
  menuCoords,
  kebabTriggerRefs,
  onClearFilters,
  onToggleKebab,
  onToggleRole,
  onToggleMustChangePassword,
  onOpenChargeWallet,
  onOpenResetPassword,
  onOpenDelete,
  onCloseKebab,
}: UsersTableProps) {
  return (
    <div className="product-table-wrap">
      {users.length === 0 ? (
        <EmptyState text="هنوز هیچ کاربری در سیستم ثبت نشده است." />
      ) : filteredUsers.length === 0 ? (
        <div className="empty-filter-container">
          <p>هیچ کاربری با معیارهای جستجو یا فیلتر فعلی یافت نشد.</p>
          <button
            type="button"
            className="secondary-button compact-btn"
            onClick={onClearFilters}
          >
            پاک کردن فیلترها
          </button>
        </div>
      ) : (
        <table className="product-compact-table user-compact-table" aria-label="جدول کاربران سامانه">
          <thead>
            <tr>
              <th scope="col">کاربر و مشخصات</th>
              <th scope="col">نقش و سطح دسترسی</th>
              <th scope="col">کیف پول</th>
              <th scope="col">الزام تغییر رمز</th>
              <th scope="col">مصرف اسلات‌ها</th>
              <th scope="col" className="th-actions">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const isKebabOpen = activeKebabKey === String(user.id);

              return (
                <UserTableRow
                  key={user.id}
                  user={user}
                  currentUserId={currentUser?.id}
                  adminCount={adminCount}
                  nowMs={nowMs}
                  busyAction={busyAction}
                  isKebabOpen={isKebabOpen}
                  menuCoords={menuCoords}
                  kebabTriggerRef={(el) => {
                    kebabTriggerRefs.current[String(user.id)] = el;
                  }}
                  onToggleKebab={() => {
                    onToggleKebab(
                      String(user.id),
                      kebabTriggerRefs.current[String(user.id)],
                    );
                  }}
                  onToggleRole={() => onToggleRole(user)}
                  onToggleMustChangePassword={() => onToggleMustChangePassword(user)}
                  onOpenChargeWallet={() => onOpenChargeWallet(user)}
                  onOpenResetPassword={() => onOpenResetPassword(user)}
                  onOpenDelete={() => onOpenDelete(user)}
                  onCloseKebab={onCloseKebab}
                />
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
