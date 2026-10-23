import "./globals.css";
import type { Metadata } from "next";
import { DashboardProvider } from "../context/DashboardContext";
import { AppShell } from "../components/layout/AppShell";

export const metadata: Metadata = {
  title: "سامانه پایش قیمت | Price Getter",
  description: "سرویس دریافت و تحلیل قیمت کالاها و بازارهای مالی",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <DashboardProvider>
          <AppShell>{children}</AppShell>
        </DashboardProvider>
      </body>
    </html>
  );
}
