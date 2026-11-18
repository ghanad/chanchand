import { WalletTransactionRow, UserSubscriptionRow, ProductSlotInfo } from "@/lib/types";

export interface WalletData {
  wallet_balance: number;
  extra_slots: number;
  slot_expires_at?: string | null;
  slot_price: number;
  quota: {
    freeLimit: number;
    extraSlots: number;
    totalLimit: number;
    usedCount: number;
    remaining: number;
    canAdd: boolean;
    slotExpiresAt?: string | null;
    daysRemaining?: number | null;
    isExpired?: boolean;
    freeUsed?: number;
    paidActive?: number;
    paidExpired?: number;
  };
  product_slots?: ProductSlotInfo[];
  transactions: WalletTransactionRow[];
  subscriptions?: UserSubscriptionRow[];
}
