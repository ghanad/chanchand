"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { StatusStrip } from "./StatusStrip";
import { Toast } from "../common/Toast";
import { useDashboard } from "../../context/DashboardContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { toast } = useDashboard();
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/change-password") {
    return (
      <main className="login-shell">
        {children}
        <Toast message={toast} />
      </main>
    );
  }

  return (
    <div className="app-shell">
      <WorkspaceHeader />
      <div className="workspace">
        <main className="workspace-main">
          {children}
        </main>
        <StatusStrip />
      </div>
      <Toast message={toast} />
    </div>
  );
}
