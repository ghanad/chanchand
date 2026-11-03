import React from "react";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="account-layout-root" dir="rtl">{children}</div>;
}

