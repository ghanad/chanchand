"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { LatestPayload, RunStatus } from "../types/dashboard";
import { requestJson } from "../lib/api-client";
import { statusText, formatNumber } from "../lib/formatters";

export interface CurrentUser {
  id: number;
  username: string;
  email: string | null;
  role: "admin" | "viewer";
}

interface DashboardContextType {
  isAdmin: boolean;
  currentUser: CurrentUser | null;
  toast: string;
  showToast: (message: string) => void;
  summary: LatestPayload["summary"] | null;
  setSummary: React.Dispatch<React.SetStateAction<LatestPayload["summary"] | null>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  refreshTick: number;
  triggerRefresh: () => void;
  isCollecting: boolean;
  runNow: () => Promise<void>;
  logout: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [toast, setToast] = useState("");
  const [summary, setSummary] = useState<LatestPayload["summary"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isCollecting, setIsCollecting] = useState(false);

  const showToastTimer = useRef<number>(0);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(showToastTimer.current);
    showToastTimer.current = window.setTimeout(() => setToast(""), 3400);
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  const fetchSummary = useCallback(async () => {
    if (pathname === "/login") return;
    try {
      const data = await requestJson<LatestPayload>("/api/latest");
      setSummary(data.summary);
    } catch {
      // Ignore background summary load error
    }
  }, [pathname]);

  const fetchCurrentUser = useCallback(async () => {
    if (pathname === "/login") return;
    try {
      const data = await requestJson<{ user: CurrentUser }>("/api/auth/me");
      setCurrentUser(data.user);
    } catch {
      setCurrentUser(null);
    }
  }, [pathname]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, refreshTick]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setCurrentUser(null);
      window.location.href = "/login";
    }
  }, []);

  const runNow = useCallback(async () => {
    if (!isAdmin) return;
    setIsCollecting(true);
    try {
      const result = await requestJson<{ run_id: number; status: RunStatus }>("/admin/run-now", {
        method: "POST",
      });
      showToast(`Run ${formatNumber(result.run_id)} ${statusText(result.status)} شد.`);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطای ناشناخته");
    } finally {
      setIsCollecting(false);
    }
  }, [isAdmin, showToast, triggerRefresh]);

  return (
    <DashboardContext.Provider
      value={{
        isAdmin,
        currentUser,
        toast,
        showToast,
        summary,
        setSummary,
        loading,
        setLoading,
        refreshTick,
        triggerRefresh,
        isCollecting,
        runNow,
        logout,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
}
