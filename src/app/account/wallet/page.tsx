"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { requestJson } from "@/lib/api-client";
import { PackageRow, PaymentTransactionRow } from "@/lib/types";
import {
  WalletData,
  PaymentCallbackBanner,
  WalletHeroGrid,
  WalletDirectSlotPanel,
  WalletPackagesGrid,
  WalletTransactionsPanel,
} from "@/components/views/wallet";

function WalletContent() {
  const searchParams = useSearchParams();
  const { currentUser, showToast, refreshCurrentUser, triggerRefresh } = useDashboard();

  const packagesSectionRef = useRef<HTMLDivElement>(null);

  // Data states
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Action states
  const [nowMs] = useState(() => Date.now());
  const [buyingSlot, setBuyingSlot] = useState(false);
  const [activeTxTab, setActiveTxTab] = useState<"wallet" | "payments" | "subscriptions">("wallet");
  const [copiedRefId, setCopiedRefId] = useState<string | null>(null);

  // Focus packages section if query param focus=topup
  useEffect(() => {
    if (searchParams.get("focus") === "topup" && packagesSectionRef.current) {
      packagesSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searchParams]);

  // Load wallet data
  const loadWallet = useCallback(async () => {
    try {
      const data = await requestJson<WalletData>("/api/user/wallet");
      setWalletData(data);
    } catch {
      // Ignore background load error
    }
  }, []);

  // Load packages
  const loadPackages = useCallback(async () => {
    try {
      const data = await requestJson<{ packages: PackageRow[] }>("/api/packages");
      setPackages(data.packages || []);
    } catch {
      // Ignore background load error
    }
  }, []);

  // Load payment transactions
  const loadPaymentTransactions = useCallback(async () => {
    try {
      const data = await requestJson<{ transactions: PaymentTransactionRow[] }>("/api/payments");
      setPaymentTransactions(data.transactions || []);
    } catch {
      // Ignore background load error
    }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([loadWallet(), loadPackages(), loadPaymentTransactions()]).finally(() => {
      setLoading(false);
    });
  }, [loadWallet, loadPackages, loadPaymentTransactions]);

  if (!currentUser) {
    return (
      <div className="wallet-view-container" dir="rtl">
        <div style={{ padding: "48px 0", textAlign: "center", fontSize: "12.5px", color: "var(--muted)" }}>
          در حال بارگذاری اطلاعات کیف پول...
        </div>
      </div>
    );
  }

  const balance = walletData?.wallet_balance ?? currentUser.wallet_balance ?? 0;
  const extraSlots = walletData?.extra_slots ?? currentUser.extra_slots ?? 0;
  const slotPrice = walletData?.slot_price ?? currentUser.slot_price ?? 50000;
  const quota = walletData?.quota ?? currentUser.quota ?? {
    freeLimit: 3,
    extraSlots,
    totalLimit: 3 + extraSlots,
    usedCount: 0,
    remaining: 3,
    canAdd: true,
  };

  const freeQuotaUsed = Math.min(quota.usedCount, 3);
  const usedPercentage = Math.min(
    100,
    Math.round((quota.usedCount / Math.max(1, quota.totalLimit)) * 100)
  );

  const canAffordSlot = balance >= slotPrice;
  const deficit = Math.max(0, slotPrice - balance);
  const walletTransactions = walletData?.transactions || [];

  // Handle buying single slot from wallet balance
  async function handleBuySlotFromWallet() {
    if (!canAffordSlot || buyingSlot) return;
    setBuyingSlot(true);
    try {
      const res = await requestJson<{ success: boolean; message: string }>("/api/user/wallet/buy-slot", {
        method: "POST",
      });
      showToast(res.message || "یک اسلات جدید با موفقیت فعال شد.");
      await refreshCurrentUser();
      triggerRefresh();
      await loadWallet();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در خرید اسلات محصول");
    } finally {
      setBuyingSlot(false);
    }
  }

  // Copy ref ID helper
  function handleCopyRefId(refId: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(refId);
      setCopiedRefId(refId);
      showToast("کد پیگیری کپی شد.");
      setTimeout(() => setCopiedRefId(null), 2000);
    }
  }

  return (
    <div className="wallet-view-container" dir="rtl">
      {/* سربرگ اختصاصی صفحه کیف پول و سهمیه پایش */}
      <div className="account-header-card">
        <div className="account-header-info">
          <div className="account-avatar-box wallet-avatar-box" aria-hidden="true">
            💳
          </div>

          <div className="account-details">
            <nav className="account-breadcrumbs" aria-label="مسیر راهنما">
              <Link href="/products">محصولات</Link>
              <span aria-hidden="true">/</span>
              <span>کیف پول و سهمیه پایش</span>
            </nav>

            <div className="account-title-row">
              <h1 className="account-username">
                کیف پول و مدیریت سهمیه پایش
              </h1>
            </div>

            <p className="account-meta-text">
              مدیریت موجودی اعتباری، بسته‌های افزایش ظرفیت و سوابق مالی کاربر @{currentUser.username}
            </p>
          </div>
        </div>
      </div>

      {/* بنر وضعیت بازگشت از درگاه پرداخت */}
      <PaymentCallbackBanner />

      {/* بخش ۱: کارت دوتایی هدر (کارت اعتباری کیف پول + کارت وضعیت سهمیه) */}
      <WalletHeroGrid
        username={currentUser.username}
        role={currentUser.role}
        balance={balance}
        canAffordSlot={canAffordSlot}
        buyingSlot={buyingSlot}
        deficit={deficit}
        quota={quota}
        extraSlots={extraSlots}
        freeQuotaUsed={freeQuotaUsed}
        usedPercentage={usedPercentage}
        onBuySlot={handleBuySlotFromWallet}
        onScrollToPackages={() => {
          packagesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      {/* بنر اطلاع‌رسانی خرید تکی از موجودی کیف پول */}
      {currentUser.role !== "admin" && (
        <WalletDirectSlotPanel
          slotPrice={slotPrice}
          canAffordSlot={canAffordSlot}
          deficit={deficit}
          buyingSlot={buyingSlot}
          onBuySlot={handleBuySlotFromWallet}
        />
      )}

      {/* بخش ۲: بسته‌های افزایش ظرفیت آنلاین (با درگاه بانکی) */}
      <WalletPackagesGrid
        packagesSectionRef={packagesSectionRef}
        loading={loading}
        packages={packages}
        slotPrice={slotPrice}
      />

      {/* بخش ۳: تاریخچه تراکنش‌ها */}
      <WalletTransactionsPanel
        walletTransactions={walletTransactions}
        paymentTransactions={paymentTransactions}
        subscriptions={walletData?.subscriptions || []}
        activeTxTab={activeTxTab}
        setActiveTxTab={setActiveTxTab}
        nowMs={nowMs}
        copiedRefId={copiedRefId}
        onCopyRefId={handleCopyRefId}
      />
    </div>
  );
}

export default function AccountWalletPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "48px 0", textAlign: "center", fontSize: "12.5px", color: "var(--muted)" }}>
          در حال بارگذاری اطلاعات کیف پول...
        </div>
      }
    >
      <WalletContent />
    </Suspense>
  );
}
