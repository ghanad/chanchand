"use client";

import React, { useEffect, useState, useCallback } from "react";
import { PriceRow, LatestPayload } from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import { formatNumber } from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { PanelHead } from "../common/PanelHead";
import { PriceTable } from "../tables/PriceTable";

export function PricesView() {
  const { setSummary, setLoading, showToast, refreshTick } = useDashboard();
  const [rows, setRows] = useState<PriceRow[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await requestJson<LatestPayload>("/api/latest");
      setRows(payload.rows);
      setSummary(payload.summary);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت قیمت‌ها");
    } finally {
      setLoading(false);
    }
  }, [setLoading, setSummary, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  return (
    <section className="panel">
      <PanelHead title="آخرین snapshot قیمت‌ها" meta={`${formatNumber(rows.length)} ردیف`} />
      <PriceTable rows={rows} />
    </section>
  );
}
