import "./globals.css";
import type { Metadata } from "next";
import { DashboardProvider } from "../context/DashboardContext";
import { AppShell } from "../components/layout/AppShell";

export const metadata: Metadata = {
  title: "چن چند",
  description: "سامانه پایش و تحلیل قیمت کالاها و بازارهای مالی — چن چند",
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
