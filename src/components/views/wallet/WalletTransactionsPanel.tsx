import React from "react";
import { PaymentTransactionRow, UserSubscriptionRow, WalletTransactionRow } from "@/lib/types";
import { formatNumber, formatDate } from "@/lib/formatters";
import { EmptyState } from "@/components/common/EmptyState";

interface WalletTransactionsPanelProps {
  walletTransactions: WalletTransactionRow[];
  paymentTransactions: PaymentTransactionRow[];
  subscriptions: UserSubscriptionRow[];
  activeTxTab: "wallet" | "payments" | "subscriptions";
  setActiveTxTab: (tab: "wallet" | "payments" | "subscriptions") => void;
  nowMs: number;
  copiedRefId: string | null;
  onCopyRefId: (refId: string) => void;
}

export function WalletTransactionsPanel({
  walletTransactions,
  paymentTransactions,
  subscriptions,
  activeTxTab,
  setActiveTxTab,
  nowMs,
  copiedRefId,
  onCopyRefId,
}: WalletTransactionsPanelProps) {
  return (
    <section className="wallet-tx-panel" aria-label="تاریخچه تراکنش‌های کیف پول و پرداخت‌ها">
      <div className="wallet-tx-panel-header">
        <div className="wallet-section-titles">
          <h2>
            <span aria-hidden="true">🧾</span>
            <span>تاریخچه و گزارش مالی</span>
          </h2>
          <p>مشاهده گردش حساب کیف پول و سوابق پرداخت‌های بانکی</p>
        </div>

        <div className="wallet-tab-switch-group">
          <button
            type="button"
            onClick={() => setActiveTxTab("wallet")}
            className={`wallet-tab-switch-btn ${activeTxTab === "wallet" ? "active" : ""}`}
          >
            <span>گردش کیف پول</span>
            <span className="wallet-tab-count-badge">
              {formatNumber(walletTransactions.length)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTxTab("payments")}
            className={`wallet-tab-switch-btn ${activeTxTab === "payments" ? "active" : ""}`}
          >
            <span>پرداخت‌های درگاه</span>
            <span className="wallet-tab-count-badge">
              {formatNumber(paymentTransactions.length)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTxTab("subscriptions")}
            className={`wallet-tab-switch-btn ${activeTxTab === "subscriptions" ? "active" : ""}`}
          >
            <span>دوره‌ها و اشتراک‌ها</span>
            <span className="wallet-tab-count-badge">
              {formatNumber(subscriptions.length)}
            </span>
          </button>
        </div>
      </div>

      {/* ۱. جدول تراکنش‌های کیف پول */}
      {activeTxTab === "wallet" && (
        walletTransactions.length === 0 ? (
          <EmptyState text="هنوز هیچ تراکنشی در کیف پول شما ثبت نشده است." />
        ) : (
          <div className="wallet-table-wrap">
            <table className="wallet-table" aria-label="جدول گردش کیف پول">
              <thead>
                <tr>
                  <th scope="col">نوع تراکنش</th>
                  <th scope="col">مبلغ</th>
                  <th scope="col">موجودی پس از تراکنش</th>
                  <th scope="col">شرح و توضیحات</th>
                  <th scope="col">تاریخ و زمان</th>
                </tr>
              </thead>
              <tbody>
                {walletTransactions.map((tx) => {
                  const isPositive = tx.amount > 0;
                  return (
                    <tr key={tx.id}>
                      <td>
                        <span
                          className="status-pill"
                          style={{
                            background: isPositive ? "rgba(19, 118, 79, 0.08)" : "rgba(180, 59, 59, 0.08)",
                            color: isPositive ? "var(--ok)" : "var(--danger)",
                            border: `1px solid ${isPositive ? "rgba(19, 118, 79, 0.2)" : "rgba(180, 59, 59, 0.2)"}`,
                          }}
                        >
                          {tx.type === "admin_charge"
                            ? "شارژ توسط مدیر"
                            : tx.type === "slot_purchase"
                            ? "خرید اسلات محصول"
                            : "تعدیل موجودی"}
                        </span>
                      </td>
                      <td>
                        <span className={isPositive ? "wallet-amount-positive" : "wallet-amount-negative"}>
                          {isPositive ? "+" : ""}
                          {formatNumber(tx.amount)} تومان
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFeatureSettings: "tnum", direction: "ltr", display: "inline-block" }}>
                          {formatNumber(tx.balance_after)} تومان
                        </span>
                      </td>
                      <td style={{ color: "var(--muted)" }}>
                        {tx.description || "-"}
                      </td>
                      <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {formatDate(tx.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ۲. جدول پرداخت‌های آنلاین درگاه */}
      {activeTxTab === "payments" && (
        paymentTransactions.length === 0 ? (
          <EmptyState text="هنوز هیچ پرداخت آنلاینی در حساب شما ثبت نشده است." />
        ) : (
          <div className="wallet-table-wrap">
            <table className="wallet-table" aria-label="جدول پرداخت‌های بانکی">
              <thead>
                <tr>
                  <th scope="col">عنوان بسته</th>
                  <th scope="col">اسلات‌های دریافتی</th>
                  <th scope="col">مبلغ پرداختی</th>
                  <th scope="col">درگاه بانکی</th>
                  <th scope="col">وضعیت تراکنش</th>
                  <th scope="col">کد پیگیری شتاب</th>
                  <th scope="col">تاریخ پرداخت</th>
                </tr>
              </thead>
              <tbody>
                {paymentTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ fontWeight: 600 }}>
                      {tx.package_title}
                    </td>
                    <td>
                      <span className="wallet-package-slots-tag">
                        +{formatNumber(tx.slots)}
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontFeatureSettings: "tnum", direction: "ltr", display: "inline-block" }}>
                        {formatNumber(tx.amount_toman)} تومان
                      </strong>
                    </td>
                    <td style={{ color: "var(--muted)" }}>
                      {tx.gateway === "zarinpal" ? "زرین‌پال" : tx.gateway === "mock" ? "آزمایشی" : tx.gateway}
                    </td>
                    <td>
                      <span
                        className="status-pill"
                        style={{
                          background:
                            tx.status === "paid"
                              ? "rgba(19, 118, 79, 0.1)"
                              : tx.status === "pending"
                              ? "rgba(217, 119, 6, 0.1)"
                              : "rgba(180, 59, 59, 0.1)",
                          color:
                            tx.status === "paid"
                              ? "var(--ok)"
                              : tx.status === "pending"
                              ? "var(--warn)"
                              : "var(--danger)",
                          border: `1px solid ${
                            tx.status === "paid"
                              ? "rgba(19, 118, 79, 0.25)"
                              : tx.status === "pending"
                              ? "rgba(217, 119, 6, 0.25)"
                              : "rgba(180, 59, 59, 0.25)"
                          }`,
                        }}
                      >
                        {tx.status === "paid"
                          ? "پرداخت موفق"
                          : tx.status === "pending"
                          ? "در انتظار پرداخت"
                          : "ناموفق / لغو شده"}
                      </span>
                    </td>
                    <td>
                      {tx.ref_id ? (
                        <button
                          type="button"
                          onClick={() => onCopyRefId(tx.ref_id!)}
                          className="wallet-ref-code"
                          title="کلیک برای کپی کد پیگیری"
                          style={{ cursor: "pointer", border: "1px dashed var(--line)" }}
                        >
                          {tx.ref_id} {copiedRefId === tx.ref_id ? "✓" : ""}
                        </button>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>-</span>
                      )}
                    </td>
                    <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {formatDate(tx.paid_at || tx.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ۳. جدول دوره‌ها و اشتراک‌های فعال و قبلی */}
      {activeTxTab === "subscriptions" && (
        subscriptions.length === 0 ? (
          <EmptyState text="هنوز هیچ دوره اشتراکی برای شما ثبت نشده است." />
        ) : (
          <div className="wallet-table-wrap">
            <table className="wallet-table" aria-label="جدول دوره‌های اشتراک">
              <thead>
                <tr>
                  <th scope="col">عنوان دوره / بسته</th>
                  <th scope="col">ظرفیت اسلات</th>
                  <th scope="col">نوع شارژ</th>
                  <th scope="col">مدت اعتبار</th>
                  <th scope="col">تاریخ شروع</th>
                  <th scope="col">تاریخ پایان</th>
                  <th scope="col">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => {
                  const isSubActive = new Date(sub.expires_at).getTime() > nowMs;
                  const daysLeft = Math.max(0, Math.ceil((new Date(sub.expires_at).getTime() - nowMs) / (1000 * 60 * 60 * 24)));
                  return (
                    <tr key={sub.id}>
                      <td style={{ fontWeight: 600 }}>
                        {sub.package_title || (sub.source_type === "wallet_slot" ? "شارژ تک‌اسلات با کیف پول" : "شارژ سهمیه توسط مدیر")}
                      </td>
                      <td>
                        <span className="wallet-package-slots-tag">
                          +{formatNumber(sub.slots)} محصول
                        </span>
                      </td>
                      <td style={{ color: "var(--muted)" }}>
                        {sub.source_type === "package"
                          ? "بسته آنلاین"
                          : sub.source_type === "wallet_slot"
                          ? "کیف پول"
                          : "مدیر سیستم"}
                      </td>
                      <td>{formatNumber(sub.duration_days)} روز</td>
                      <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {formatDate(sub.starts_at)}
                      </td>
                      <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {formatDate(sub.expires_at)}
                      </td>
                      <td>
                        <span
                          className="status-pill"
                          style={{
                            background: isSubActive ? "rgba(19, 118, 79, 0.1)" : "rgba(180, 59, 59, 0.1)",
                            color: isSubActive ? "var(--ok)" : "var(--muted)",
                            border: `1px solid ${isSubActive ? "rgba(19, 118, 79, 0.25)" : "rgba(180, 59, 59, 0.25)"}`,
                          }}
                        >
                          {isSubActive ? `فعال (${daysLeft} روز مانده)` : "منقضی شده"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}
