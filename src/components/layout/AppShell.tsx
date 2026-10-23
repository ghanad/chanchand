"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { StatusStrip } from "./StatusStrip";
import { Toast } from "../common/Toast";
import { useDashboard } from "../../context/DashboardContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { toast } = useDashboard();
  const pathname = usePathname();

  if (pathname === "/login") {
    return (
      <main className="login-shell">
        {children}
        <Toast message={toast} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="workspace">
        <WorkspaceHeader />
        {children}
        <StatusStrip />
      </section>
      <Toast message={toast} />
    </main>
  );
}
