import React from "react";
import Link from "next/link";
import { formatNumber } from "../../../lib/formatters";

interface HeaderWalletChipProps {
  balance: number;
}

export function HeaderWalletChip({ balance }: HeaderWalletChipProps) {
  return (
    <div className="header-wallet-chip" title="موجودی کیف پول">
      <span className="header-wallet-label">موجودی:</span>
      <span className="header-wallet-amount" dir="ltr">
        {formatNumber(balance)} تومان
      </span>
      <Link
        href="/account/wallet?focus=topup"
        className="header-wallet-btn"
        title="افزایش اعتبار کیف پول"
      >
        + شارژ
      </Link>
    </div>
  );
}
