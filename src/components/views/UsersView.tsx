"use client";

import React from "react";
import { formatNumber } from "@/lib/formatters";
import { PanelHead } from "@/components/common/PanelHead";
import {
  UsersToolbar,
  UsersTable,
  AddUserModal,
  ResetPasswordModal,
  DeleteUserModal,
  ChargeWalletModal,
} from "./users";
import { useUsersState } from "./users/useUsersState";

export function UsersView() {
  const {
    currentUser,
    nowMs,
    users,
    busyAction,
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
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    activeKebabKey,
    setActiveKebabKey,
    menuCoords,
    setMenuCoords,
    kebabTriggerRefs,
    toggleKebab,
    adminCount,
    viewerCount,
    filteredUsers,
    handleCreateUser,
    handleToggleRole,
    handleToggleMustChangePassword,
    handleResetPassword,
    handleConfirmDelete,
    handleChargeWallet,
  } = useUsersState();

  return (
    <div className="users-page">
      <section className="panel users-list-panel">
        <PanelHead
          title="مدیریت کاربران و دسترسی‌ها"
          meta={`${formatNumber(users.length)} کاربر`}
          action={
            currentUser?.role === "admin" ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => setShowAddUserModal(true)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                <span>افزودن کاربر جدید</span>
              </button>
            ) : null
          }
        />

        <UsersToolbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          totalUsers={users.length}
          adminCount={adminCount}
          viewerCount={viewerCount}
        />

        <UsersTable
          users={users}
          filteredUsers={filteredUsers}
          currentUser={currentUser}
          adminCount={adminCount}
          nowMs={nowMs}
          busyAction={busyAction}
          activeKebabKey={activeKebabKey}
          menuCoords={menuCoords}
          kebabTriggerRefs={kebabTriggerRefs}
          onClearFilters={() => {
            setSearchQuery("");
            setStatusFilter("all");
          }}
          onToggleKebab={toggleKebab}
          onToggleRole={handleToggleRole}
          onToggleMustChangePassword={handleToggleMustChangePassword}
          onOpenChargeWallet={(user) => {
            setActiveKebabKey(null);
            setMenuCoords(null);
            setWalletUser(user);
            setChargeOpType("charge");
            setChargeAmount("50000");
            setChargeDescription("");
          }}
          onOpenResetPassword={(user) => {
            setActiveKebabKey(null);
            setMenuCoords(null);
            setResetUser(user);
            setResetPasswordValue("");
            setResetMustChangePassword(true);
          }}
          onOpenDelete={(user) => {
            setActiveKebabKey(null);
            setMenuCoords(null);
            setUserToDelete(user);
          }}
          onCloseKebab={() => {
            setActiveKebabKey(null);
            setMenuCoords(null);
          }}
        />
      </section>

      <AddUserModal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        onSubmit={handleCreateUser}
        username={newUsername}
        setUsername={setNewUsername}
        password={newPassword}
        setPassword={setNewPassword}
        email={newEmail}
        setEmail={setNewEmail}
        mobile={newMobile}
        setMobile={setNewMobile}
        role={newRole}
        setRole={setNewRole}
        mustChangePassword={newMustChangePassword}
        setMustChangePassword={setNewMustChangePassword}
        isBusy={busyAction === "create"}
      />

      <ResetPasswordModal
        user={resetUser}
        onClose={() => {
          setResetUser(null);
          setResetPasswordValue("");
          setResetMustChangePassword(true);
        }}
        onSubmit={handleResetPassword}
        password={resetPasswordValue}
        setPassword={setResetPasswordValue}
        mustChangePassword={resetMustChangePassword}
        setMustChangePassword={setResetMustChangePassword}
        isBusy={Boolean(busyAction?.startsWith("pass:"))}
      />

      <DeleteUserModal
        user={userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={handleConfirmDelete}
        isBusy={busyAction === `delete:${userToDelete?.id}`}
      />

      <ChargeWalletModal
        user={walletUser}
        onClose={() => setWalletUser(null)}
        onSubmit={handleChargeWallet}
        chargeOpType={chargeOpType}
        setChargeOpType={setChargeOpType}
        chargeAmount={chargeAmount}
        setChargeAmount={setChargeAmount}
        chargeDescription={chargeDescription}
        setChargeDescription={setChargeDescription}
        isBusy={Boolean(busyAction?.startsWith("wallet:"))}
      />
    </div>
  );
}
