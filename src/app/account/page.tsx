import React, { Suspense } from "react";
import { AccountView } from "@/components/views/AccountView";

export const metadata = {
  title: "حساب من — چن چند",
  description: "مدیریت حساب کاربری، سهمیه پایش و بسته‌ها",
};

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-[var(--text-muted)]">در حال بارگذاری حساب من...</div>}>
      <AccountView />
    </Suspense>
  );
}
