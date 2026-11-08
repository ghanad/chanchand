import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ProductRow, SourceRow, ProductsPayload, PriceRow, LatestPayload } from "../../../types/dashboard";
import { requestJson } from "../../../lib/api-client";
import { useDashboard } from "../../../context/DashboardContext";
import { useProductFilters } from "./useProductFilters";
import { useProductActions } from "./useProductActions";
import { useKebabMenu } from "./useKebabMenu";

export function useProductsState() {
  const { isAdmin, currentUser, setLoading, showToast, refreshTick, triggerRefresh } = useDashboard();
  const basePath = isAdmin ? "/admin" : "";
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [latestPrices, setLatestPrices] = useState<PriceRow[]>([]);

  const filters = useProductFilters({ products, latestPrices, isAdmin });
  const kebab = useKebabMenu({ isAdmin, showToast });
  const actions = useProductActions({
    isAdmin,
    currentUser,
    showToast,
    triggerRefresh,
    setProducts,
  });

  const { setForm } = actions;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [payload, latestPayload] = await Promise.all([
        requestJson<ProductsPayload>("/api/products"),
        requestJson<LatestPayload>("/api/latest").catch(() => ({ rows: [] as PriceRow[], summary: null })),
      ]);
      setProducts(payload.products);
      setSources(payload.sources);
      if (latestPayload && Array.isArray(latestPayload.rows)) {
        setLatestPrices(latestPayload.rows);
      }
      setForm((current) => {
        if (current.source_key) return current;
        const defaultSource = payload.sources.find((s) => s.key === "digikala_api") || payload.sources[0];
        return { ...current, source_key: defaultSource?.key || "" };
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت لیست محصولات");
    } finally {
      setLoading(false);
    }
  }, [setLoading, showToast, setForm]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  const configuredSources = useMemo(() => sources.filter((source) => source.configured), [sources]);

  return {
    isAdmin,
    currentUser,
    basePath,
    configuredSources,
    ...filters,
    ...kebab,
    ...actions,
  };
}
