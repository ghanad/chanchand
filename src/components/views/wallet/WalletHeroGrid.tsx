import React from "react";
import { formatNumber } from "@/lib/formatters";
import { WalletData } from "./types";

interface WalletHeroGridProps {
  username: string;
  role: string;
  balance: number;
  canAffordSlot: boolean;
  buyingSlot: boolean;
  deficit: number;
  quota: WalletData["quota"];
  extraSlots: number;
  freeQuotaUsed: number;
  usedPercentage: number;
  onBuySlot: () => void;
  onScrollToPackages: () => void;
}

export function WalletHeroGrid({
  username,
  role,
  balance,
  canAffordSlot,
  buyingSlot,
  deficit,
  quota,
  extraSlots,
  freeQuotaUsed,
  usedPercentage,
  onBuySlot,
  onScrollToPackages,
}: WalletHeroGridProps) {
  const isAdmin = role === "admin";

  return (
    <section className="wallet-hero-grid" aria-label="کیف پول و سهمیه پایش">
      {/* ۱. کارت اعتباری دیجیتال */}
      <div className="wallet-credit-card">
        <div className="wallet-card-header">
          <div className="wallet-card-brand">
            <div className="wallet-card-chip-icon" aria-hidden="true" />
            <span className="wallet-card-title">کیف پول اعتباری چن‌چند</span>
          </div>
          <span className="wallet-card-user-tag" dir="ltr">
            @{username}
          </span>
        </div>

        <div className="wallet-card-middle">
          <div className="wallet-card-balance-lbl">موجودی در دسترس</div>
          <div className="wallet-card-balance-val">
            <strong>{formatNumber(balance)}</strong>
            <span>تومان</span>
          </div>
        </div>

        <div className="wallet-card-actions">
          {!isAdmin && (
            <button
              type="button"
              disabled={!canAffordSlot || buyingSlot}
              onClick={onBuySlot}
              className="wallet-card-btn-primary"
              title={canAffordSlot ? "خرید مستقیم یک اسلات از موجودی" : `کسری موجودی: ${formatNumber(deficit)} تومان`}
            >
              {buyingSlot ? (
                <span>در حال فعال‌سازی...</span>
              ) : (
                <>
                  <span>خرید ۱ اسلات با موجودی</span>
                  <span aria-hidden="true">⚡</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onScrollToPackages}
            className="wallet-card-btn-secondary"
          >
            <span>+ افزایش اعتبار با بسته‌ها</span>
            <span aria-hidden="true">↓</span>
          </button>
        </div>
      </div>

      {/* ۲. کارت تحلیلی سهمیه و پایش */}
      <div className="wallet-quota-card">
        <div className="wallet-quota-top">
          <div className="wallet-quota-heading">
            <h3>
              <span aria-hidden="true">📊</span>
              <span>وضعیت ظرفیت پایش محصولات</span>
            </h3>
            <span>
              {isAdmin
                ? "کاربر مدیر — پایش نامحدود"
                : `${formatNumber(quota.usedCount)} از ${formatNumber(quota.totalLimit)} محصول فعال`}
            </span>
          </div>

          <div
            className="wallet-quota-pill"
            style={{
              background: isAdmin
                ? undefined
                : quota.isExpired
                ? "rgba(180, 59, 59, 0.12)"
                : quota.daysRemaining != null
                ? "rgba(19, 118, 79, 0.12)"
                : undefined,
              color: isAdmin
                ? undefined
                : quota.isExpired
                ? "var(--danger)"
                : quota.daysRemaining != null
                ? "var(--ok)"
                : undefined,
              borderColor: isAdmin
                ? undefined
                : quota.isExpired
                ? "rgba(180, 59, 59, 0.3)"
                : quota.daysRemaining != null
                ? "rgba(19, 118, 79, 0.3)"
                : undefined,
            }}
          >
            {isAdmin
              ? "نامحدود"
              : quota.isExpired
              ? "اشتراک منقضی شده"
              : quota.daysRemaining != null
              ? `${formatNumber(quota.daysRemaining)} روز باقی‌مانده`
              : `${formatNumber(quota.remaining)} محصول خالی`}
          </div>
        </div>

        <div className="wallet-progress-block">
          {!isAdmin ? (
            <>
              <div className="wallet-progress-track">
                <div
                  className={`wallet-progress-bar-fill ${usedPercentage >= 100 || quota.isExpired ? "warning" : ""}`}
                  style={{ width: `${usedPercentage}%` }}
                />
              </div>
              <div className="wallet-progress-labels">
                <span>{formatNumber(usedPercentage)}٪ تکمیل شده</span>
                <span>سقف کل: {formatNumber(quota.totalLimit)} کالا</span>
              </div>
            </>
          ) : (
            <div style={{ height: "9px" }} />
          )}
        </div>

        <div className="wallet-quota-metrics-row">
          <div className="wallet-quota-mini-stat">
            <div className="wallet-quota-mini-num">{formatNumber(freeQuotaUsed)} / ۳</div>
            <div className="wallet-quota-mini-lbl">سهمیه پایه رایگان (دائمی)</div>
          </div>

          <div className="wallet-quota-mini-stat">
            <div className="wallet-quota-mini-num" style={{ color: quota.isExpired ? "var(--danger)" : undefined }}>
              {isAdmin ? "∞" : `+${formatNumber(extraSlots)}`}
            </div>
            <div className="wallet-quota-mini-lbl">
              {quota.isExpired ? "اسلات منقضی شده" : "اسلات‌های ماهانه فعال"}
            </div>
          </div>

          <div className="wallet-quota-mini-stat">
            <div className="wallet-quota-mini-num">
              {isAdmin ? "∞" : formatNumber(quota.remaining)}
            </div>
            <div className="wallet-quota-mini-lbl">ظرفیت باقی‌مانده</div>
          </div>
        </div>

        <div className="wallet-quota-note">
          <span aria-hidden="true">🛡️</span>
          <span>
            سهمیه پایه (۳ محصول) دائمی و رایگان است. اسلات‌های اضافه به صورت اشتراک ماهانه (۳۰ روزه) فعال می‌شوند.
            {quota.slotExpiresAt && !quota.isExpired && (
              <strong style={{ marginInlineStart: "6px", color: "var(--ok)" }}>
                (اعتبار فعال تا: {new Date(quota.slotExpiresAt).toLocaleDateString("fa-IR")} — {quota.daysRemaining} روز مانده)
              </strong>
            )}
            {quota.isExpired && (
              <strong style={{ marginInlineStart: "6px", color: "var(--danger)" }}>
                (اشتراک اسلات‌های اضافه منقضی شده است — جهت فعال‌سازی مجدد پایش کالاها، اشتراک را تمدید کنید)
              </strong>
            )}
          </span>
        </div>
      </div>
    </section>
  );
}
