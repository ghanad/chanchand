import React, { useState, useCallback, useMemo } from "react";
import { ProductRow, PriceRow } from "../../../types/dashboard";
import {
  ProductItemWithPrice,
  SortField,
  SortDirection,
  ProductTab,
} from "./types";

interface UseProductFiltersProps {
  products: ProductRow[];
  latestPrices: PriceRow[];
  isAdmin: boolean;
}

export function useProductFilters({ products, latestPrices, isAdmin }: UseProductFiltersProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ProductTab>("all");

  const configProducts = useMemo(() => products.filter((p) => p.configured), [products]);
  const configuredProductCount = configProducts.length;

  // Combine products with latest prices
  const productsWithPrices = useMemo<ProductItemWithPrice[]>(() => {
    const priceMap = new Map<string, PriceRow>();
    for (const row of latestPrices) {
      if (!priceMap.has(row.product_key)) {
        priceMap.set(row.product_key, row);
      }
    }
    return configProducts.map((p) => ({
      ...p,
      latestSnapshot: priceMap.get(p.key) || null,
    }));
  }, [configProducts, latestPrices]);

  // Search filter matcher
  const matchesSearch = useCallback(
    (product: ProductItemWithPrice) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const matchTitle = product.title.toLowerCase().includes(q);
      const matchKey = product.key.toLowerCase().includes(q);
      const matchUrl = (!product.is_public || isAdmin) && Boolean(product.primary_target?.url.toLowerCase().includes(q));
      const matchSource = product.sources.some((s) => s.toLowerCase().includes(q));
      return matchTitle || matchKey || matchUrl || matchSource;
    },
    [searchQuery, isAdmin]
  );

  // Sorting function
  const sortList = useCallback(
    (items: ProductItemWithPrice[]) => {
      if (!sortField) return items;

      return [...items].sort((a, b) => {
        let comparison = 0;
        if (sortField === "title") {
          comparison = a.title.localeCompare(b.title, "fa", { numeric: true, sensitivity: "base" });
        } else if (sortField === "price") {
          const priceA = a.latestSnapshot?.price_toman ?? null;
          const priceB = b.latestSnapshot?.price_toman ?? null;
          if (priceA === null && priceB === null) comparison = 0;
          else if (priceA === null) comparison = 1;
          else if (priceB === null) comparison = -1;
          else comparison = priceA - priceB;
        } else if (sortField === "status") {
          const activeA = a.enabled_target_count > 0 ? 1 : 0;
          const activeB = b.enabled_target_count > 0 ? 1 : 0;
          comparison = activeA - activeB;
        } else if (sortField === "date") {
          const dateA = a.latestSnapshot?.observed_at ? new Date(a.latestSnapshot.observed_at).getTime() : 0;
          const dateB = b.latestSnapshot?.observed_at ? new Date(b.latestSnapshot.observed_at).getTime() : 0;
          comparison = dateA - dateB;
        }

        return sortDirection === "asc" ? comparison : -comparison;
      });
    },
    [sortField, sortDirection]
  );

  // Partition products into personal and public market
  const personalProducts = useMemo(
    () => productsWithPrices.filter((p) => !p.is_public),
    [productsWithPrices]
  );
  const publicProducts = useMemo(
    () => productsWithPrices.filter((p) => Boolean(p.is_public)),
    [productsWithPrices]
  );

  // Filtered and sorted lists
  const filteredPersonal = useMemo(
    () => sortList(personalProducts.filter(matchesSearch)),
    [personalProducts, matchesSearch, sortList]
  );
  const filteredPublic = useMemo(
    () => sortList(publicProducts.filter(matchesSearch)),
    [publicProducts, matchesSearch, sortList]
  );
  const allFilteredCount = filteredPersonal.length + filteredPublic.length;

  function renderSortIndicator(field: SortField) {
    if (sortField !== field) {
      return (
        <span className="sort-indicator neutral" aria-hidden="true" title="مرتب‌سازی">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 15l5 5 5-5" />
            <path d="M7 9l5-5 5 5" />
          </svg>
        </span>
      );
    }
    return (
      <span className="sort-indicator active" aria-hidden="true">
        {sortDirection === "asc" ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </span>
    );
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortField(null);
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  function handleDirectSort(field: SortField | null, direction: SortDirection = "asc") {
    setSortField(field);
    setSortDirection(direction);
  }

  return {
    configProducts,
    configuredProductCount,
    productsWithPrices,
    personalProducts,
    publicProducts,
    filteredPersonal,
    filteredPublic,
    allFilteredCount,
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    sortField,
    sortDirection,
    handleSort,
    handleDirectSort,
    renderSortIndicator,
  };
}
