"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { SourceRow } from "@/types/dashboard";
import { requestJson } from "@/lib/api-client";
import { formatNumber } from "@/lib/formatters";
import { useDashboard } from "@/context/DashboardContext";
import { PanelHead } from "@/components/common/PanelHead";
import {
  SourceFormState,
  SourceStatusFilter,
  MenuCoords,
  SourcesSummary,
  SourcesToolbar,
  SourcesTable,
  SourceGuideAccordion,
  AddSourceModal,
  EditSourceModal,
  DeleteSourceModal,
  BlockedDeleteSourceModal,
} from "./sources";

const initialFormState: SourceFormState = {
  key: "",
  adapter: "digikala_api",
  rate_limit_seconds: 2,
  timeout_seconds: 15,
  currency: "IRR",
  price_multiplier: 1,
};

export function SourcesView() {
  const { isAdmin, setLoading, showToast, refreshTick, triggerRefresh } = useDashboard();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSource, setEditingSource] = useState<SourceRow | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<SourceRow | null>(null);
  const [blockedDeleteSource, setBlockedDeleteSource] = useState<SourceRow | null>(null);

  const [form, setForm] = useState<SourceFormState>(initialFormState);
  const [editForm, setEditForm] = useState<SourceFormState>(initialFormState);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SourceStatusFilter>("all");
  const [activeKebabKey, setActiveKebabKey] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);
  const kebabTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const toggleKebab = useCallback(
    (sourceKey: string) => {
      if (activeKebabKey === sourceKey) {
        setActiveKebabKey(null);
        setMenuCoords(null);
      } else {
        const triggerEl = kebabTriggerRefs.current[sourceKey];
        if (triggerEl) {
          const rect = triggerEl.getBoundingClientRect();
          const dropdownHeight = 60;
          const spaceBelow = window.innerHeight - rect.bottom;
          const openUpwards = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
          const menuWidth = 140;
          let left = rect.left;
          if (left + menuWidth > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - menuWidth - 8);
          }
          if (left < 8) {
            left = 8;
          }
          setMenuCoords({
            top: openUpwards ? undefined : rect.bottom + 4,
            bottom: openUpwards ? window.innerHeight - rect.top + 4 : undefined,
            left,
            openUpwards,
          });
        }
        setActiveKebabKey(sourceKey);
      }
    },
    [activeKebabKey],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await requestJson<{ sources: SourceRow[] }>("/api/sources");
      setSources(payload.sources);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت لیست منابع");
    } finally {
      setLoading(false);
    }
  }, [setLoading, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  // Close kebab menu on outside click, Esc, scroll, or resize
  useEffect(() => {
    if (!activeKebabKey) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".kebab-container") && !target?.closest(".kebab-menu-dropdown")) {
        setActiveKebabKey(null);
        setMenuCoords(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const lastKey = activeKebabKey;
        setActiveKebabKey(null);
        setMenuCoords(null);
        if (lastKey && kebabTriggerRefs.current[lastKey]) {
          kebabTriggerRefs.current[lastKey]?.focus();
        }
      }
    }
    function handleScroll(event: Event) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(".kebab-menu-dropdown")) return;
      setActiveKebabKey(null);
      setMenuCoords(null);
    }
    function handleResize() {
      setActiveKebabKey(null);
      setMenuCoords(null);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [activeKebabKey]);

  const totalSources = sources.length;
  const uniqueAdapters = new Set(sources.map((s) => s.adapter)).size;
  const totalTargets = sources.reduce((sum, s) => sum + (s.target_count || 0), 0);
  const activeTargets = sources.reduce((sum, s) => sum + (s.enabled_target_count || 0), 0);
  const avgRateLimit = totalSources > 0
    ? (sources.reduce((sum, s) => sum + (s.rate_limit_seconds || 0), 0) / totalSources).toFixed(1)
    : "0";

  const totalInUse = useMemo(
    () => sources.filter((s) => (s.target_count || 0) > 0).length,
    [sources],
  );
  const totalUnused = totalSources - totalInUse;

  const filteredSources = useMemo(() => {
    return sources.filter((source) => {
      const inUse = (source.target_count || 0) > 0;
      if (statusFilter === "in_use" && !inUse) return false;
      if (statusFilter === "unused" && inUse) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const matchKey = source.key.toLowerCase().includes(q);
      const matchAdapter = source.adapter.toLowerCase().includes(q);
      const matchCurrency = (source.currency || "irr").toLowerCase().includes(q);
      return matchKey || matchAdapter || matchCurrency;
    });
  }, [sources, statusFilter, searchQuery]);

  function handleOpenEdit(source: SourceRow) {
    setEditingSource(source);
    setEditForm({
      key: source.key,
      adapter: source.adapter,
      rate_limit_seconds: source.rate_limit_seconds ?? 2,
      timeout_seconds: source.timeout_seconds ?? 15,
      currency: source.currency ?? "IRR",
      price_multiplier: source.price_multiplier ?? 1,
    });
  }

  async function handleAddSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;
    setBusyAction("add");
    try {
      const result = await requestJson<{ source_key: string }>("/api/admin/sources", {
        method: "POST",
        body: JSON.stringify({
          key: form.key.trim(),
          adapter: form.adapter,
          rate_limit_seconds: Number(form.rate_limit_seconds),
          timeout_seconds: Number(form.timeout_seconds),
          currency: form.currency,
          price_multiplier: Number(form.price_multiplier),
        }),
      });
      showToast(`منبع «${result.source_key}» با موفقیت افزوده شد.`);
      setForm(initialFormState);
      setShowAddModal(false);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در افزودن منبع");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !editingSource) return;
    setBusyAction(`edit:${editingSource.key}`);
    try {
      const result = await requestJson<{ source_key: string }>(
        `/api/admin/sources/${encodeURIComponent(editingSource.key)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            adapter: editForm.adapter,
            rate_limit_seconds: Number(editForm.rate_limit_seconds),
            timeout_seconds: Number(editForm.timeout_seconds),
            currency: editForm.currency,
            price_multiplier: Number(editForm.price_multiplier),
          }),
        }
      );
      showToast(`تنظیمات منبع «${result.source_key}» ذخیره شد.`);
      setEditingSource(null);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در ویرایش منبع");
    } finally {
      setBusyAction(null);
    }
  }

  function handleDeleteClick(source: SourceRow) {
    if (!isAdmin || !source.key) return;
    if (source.target_count && source.target_count > 0) {
      setBlockedDeleteSource(source);
    } else {
      setSourceToDelete(source);
    }
  }

  async function handleConfirmDelete() {
    if (!isAdmin || !sourceToDelete?.key) return;
    const key = sourceToDelete.key;
    setBusyAction(`delete:${key}`);
    try {
      await requestJson(`/api/admin/sources/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      showToast(`منبع «${key}» حذف شد.`);
      setSourceToDelete(null);
      triggerRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در حذف منبع");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="sources-page page-stack">
      <SourcesSummary
        totalSources={totalSources}
        uniqueAdapters={uniqueAdapters}
        activeTargets={activeTargets}
        totalTargets={totalTargets}
        avgRateLimit={avgRateLimit}
      />

      <section className="panel">
        <PanelHead
          title="فهرست منابع قیمت‌گیری"
          meta={`${formatNumber(totalSources)} منبع پیکربندی‌شده`}
          action={
            isAdmin ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => setShowAddModal(true)}
              >
                + افزودن منبع جدید
              </button>
            ) : null
          }
        />

        <SourcesToolbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          totalSources={totalSources}
          totalInUse={totalInUse}
          totalUnused={totalUnused}
        />

        <SourcesTable
          sources={sources}
          filteredSources={filteredSources}
          isAdmin={isAdmin}
          busyAction={busyAction}
          activeKebabKey={activeKebabKey}
          menuCoords={menuCoords}
          kebabTriggerRefs={kebabTriggerRefs}
          onClearFilters={() => {
            setSearchQuery("");
            setStatusFilter("all");
          }}
          onToggleKebab={toggleKebab}
          onOpenEdit={handleOpenEdit}
          onDeleteClick={handleDeleteClick}
          onCloseKebab={() => {
            setActiveKebabKey(null);
            setMenuCoords(null);
          }}
        />
      </section>

      <SourceGuideAccordion />

      <AddSourceModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddSource}
        form={form}
        setForm={setForm}
        isBusy={busyAction === "add"}
      />

      <EditSourceModal
        source={editingSource}
        onClose={() => setEditingSource(null)}
        onSubmit={handleUpdateSource}
        form={editForm}
        setForm={setEditForm}
        isBusy={Boolean(busyAction?.startsWith("edit:"))}
      />

      <DeleteSourceModal
        source={sourceToDelete}
        onClose={() => setSourceToDelete(null)}
        onConfirm={handleConfirmDelete}
        isBusy={busyAction === `delete:${sourceToDelete?.key}`}
      />

      <BlockedDeleteSourceModal
        source={blockedDeleteSource}
        onClose={() => setBlockedDeleteSource(null)}
      />
    </div>
  );
}
