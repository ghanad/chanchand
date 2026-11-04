import React from "react";
import { useSearchParams } from "next/navigation";

export function PaymentCallbackBanner() {
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment_status");
  const callbackMessage = searchParams.get("message");
  const callbackRefId = searchParams.get("ref_id");

  if (!paymentStatus) return null;

  const isSuccess = paymentStatus === "success";

  return (
    <div
      className={`payment-alert-banner ${isSuccess ? "success" : "error"}`}
      role="alert"
    >
      <span className="payment-alert-icon" aria-hidden="true">
        {isSuccess ? "✅" : "⚠️"}
      </span>
      <div className="payment-alert-content">
        <div className="payment-alert-title">
          {isSuccess ? "پرداخت با موفقیت انجام شد" : "پرداخت ناموفق بود"}
        </div>
        {callbackMessage && <p style={{ margin: "2px 0 0 0" }}>{callbackMessage}</p>}
        {callbackRefId && (
          <p style={{ margin: "4px 0 0 0", fontFamily: "monospace", fontSize: "11.5px" }}>
            کد پیگیری تراکنش: <strong>{callbackRefId}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
