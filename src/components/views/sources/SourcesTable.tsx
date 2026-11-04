import React from "react";
import { SourceRow } from "@/types/dashboard";
import { EmptyState } from "@/components/common/EmptyState";
import { MenuCoords } from "./types";
import { SourceTableRow } from "./SourceTableRow";

interface SourcesTableProps {
  sources: SourceRow[];
  filteredSources: SourceRow[];
  isAdmin: boolean;
  busyAction: string | null;
  activeKebabKey: string | null;
  menuCoords: MenuCoords | null;
  kebabTriggerRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onClearFilters: () => void;
  onToggleKebab: (key: string) => void;
  onOpenEdit: (source: SourceRow) => void;
  onDeleteClick: (source: SourceRow) => void;
  onCloseKebab: () => void;
}

export function SourcesTable({
  sources,
  filteredSources,
  isAdmin,
  busyAction,
  activeKebabKey,
  menuCoords,
  kebabTriggerRefs,
  onClearFilters,
  onToggleKebab,
  onOpenEdit,
  onDeleteClick,
  onCloseKebab,
}: SourcesTableProps) {
  return (
    <div className="product-table-wrap">
      {sources.length === 0 ? (
        <EmptyState text="هنوز هیچ منبعی تعریف نشده است." />
      ) : filteredSources.length === 0 ? (
        <div className="empty-filter-container">
          <p>هیچ منبعی با معیارهای جستجو یا فیلتر فعلی یافت نشد.</p>
          <button
            type="button"
            className="secondary-button compact-btn"
            onClick={onClearFilters}
          >
            پاک کردن فیلترها
          </button>
        </div>
      ) : (
        <table className="product-compact-table source-compact-table" aria-label="جدول منابع قیمت‌گیری">
          <thead>
            <tr>
              <th scope="col">منبع و شناسه</th>
              <th scope="col">نوع آداپتور</th>
              <th scope="col">نرخ وقفه / مهلت</th>
              <th scope="col">واحد پول و ضریب</th>
              <th scope="col">اهداف و محصولات متصل</th>
              <th scope="col" className="th-actions">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredSources.map((source) => (
              <SourceTableRow
                key={source.key}
                source={source}
                isAdmin={isAdmin}
                busyAction={busyAction}
                isKebabOpen={activeKebabKey === source.key}
                menuCoords={menuCoords}
                kebabTriggerRef={(el) => {
                  kebabTriggerRefs.current[source.key] = el;
                }}
                onToggleKebab={() => onToggleKebab(source.key)}
                onOpenEdit={onOpenEdit}
                onDeleteClick={onDeleteClick}
                onCloseKebab={onCloseKebab}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
