"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  PriceRow,
  ProductRow,
  SourceRow,
  ProductsPayload,
  HistoryMetric,
} from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import {
  formatNumber,
  formatDate,
  priceAxisDomain,
  numberFormatter,
} from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { PanelHead } from "../common/PanelHead";
import { EmptyState } from "../common/EmptyState";
import { HistoryTable } from "../tables/HistoryTable";

function HistoryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setLoading, showToast, refreshTick } = useDashboard();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [history, setHistory] = useState<PriceRow[]>([]);

  const initialProduct = searchParams.get("product") || "";
  const initialSource = searchParams.get("source") || "";
  const initialLimit = searchParams.get("limit") || "200";

  const [selectedProduct, setSelectedProduct] = useState(initialProduct);
  const [selectedSource, setSelectedSource] = useState(initialSource);
  const [historyLimit, setHistoryLimit] = useState(initialLimit);
  const [historyMetric, setHistoryMetric] = useState<HistoryMetric>("toman");

  // Load products and sources
  const loadProducts = useCallback(async () => {
    try {
      const payload = await requestJson<ProductsPayload>("/api/products");
      setProducts(payload.products);
      setSources(payload.sources);
      setSelectedProduct((current) => {
        if (current && payload.products.some((p) => p.key === current)) return current;
        if (initialProduct && payload.products.some((p) => p.key === initialProduct)) return initialProduct;
        return payload.products[0]?.key || "";
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت لیست محصولات");
    }
  }, [initialProduct, showToast]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts, refreshTick]);

  // Load history data when filters change
  const loadHistory = useCallback(async () => {
    if (!selectedProduct) {
      setHistory([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ product_key: selectedProduct, limit: historyLimit });
      if (selectedSource) params.set("source_key", selectedSource);
      const payload = await requestJson<{ rows: PriceRow[] }>(`/api/history?${params.toString()}`);
      setHistory(payload.rows);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت تاریخچه");
    } finally {
      setLoading(false);
    }
  }, [historyLimit, selectedProduct, selectedSource, setLoading, showToast]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshTick]);

  // Sync URL search params
  const updateQueryParams = useCallback(
    (product: string, source: string, limit: string) => {
      const nextParams = new URLSearchParams();
      if (product) nextParams.set("product", product);
      if (source) nextParams.set("source", source);
      if (limit && limit !== "200") nextParams.set("limit", limit);
      const query = nextParams.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [pathname, router],
  );

  const handleProductChange = (val: string) => {
    setSelectedProduct(val);
    updateQueryParams(val, selectedSource, historyLimit);
  };

  const handleSourceChange = (val: string) => {
    setSelectedSource(val);
    updateQueryParams(selectedProduct, val, historyLimit);
  };

  const handleLimitChange = (val: string) => {
    setHistoryLimit(val);
    updateQueryParams(selectedProduct, selectedSource, val);
  };

  const metricConfig =
    historyMetric === "usd"
      ? {
          key: "price_usd" as const,
          label: "دلار",
          suffix: "دلار",
          empty: "برای نمایش قیمت دلاری، نرخ دلار باید در محصول usd ثبت شده باشد.",
        }
      : {
          key: "price_toman" as const,
          label: "تومان",
          suffix: "تومان",
          empty: "داده‌ای برای نمودار نیست.",
        };

  const chartRows = history.flatMap((row) => {
    const price = row[metricConfig.key];
    if (!Number.isFinite(price)) return [];

    return [
      {
        time: formatDate(row.observed_at),
        source: row.source_key,
        price: Number(price),
      },
    ];
  });

  const chartPriceDomain = chartRows.length ? priceAxisDomain(chartRows) : undefined;

  return (
    <div className="page-stack">
      <section className="panel">
        <PanelHead title="فیلتر تاریخچه" meta={`${formatNumber(history.length)} مشاهده`} />
        <div className="toolbar">
          <label>
            محصول
            <select value={selectedProduct} onChange={(e) => handleProductChange(e.target.value)}>
              {products.map((product) => (
                <option key={product.key} value={product.key}>
                  {product.title} ({product.key})
                </option>
              ))}
            </select>
          </label>
          <label>
            منبع
            <select value={selectedSource} onChange={(e) => handleSourceChange(e.target.value)}>
              <option value="">همه منابع</option>
              {sources.map((source) => (
                <option key={source.key} value={source.key}>
                  {source.key} ({source.adapter})
                </option>
              ))}
            </select>
          </label>
          <label>
            تعداد
            <select value={historyLimit} onChange={(e) => handleLimitChange(e.target.value)}>
              <option value="50">۵۰</option>
              <option value="100">۱۰۰</option>
              <option value="200">۲۰۰</option>
              <option value="500">۵۰۰</option>
            </select>
          </label>
          <div className="metric-toggle" aria-label="واحد نمودار">
            <button
              type="button"
              className={historyMetric === "toman" ? "active" : ""}
              onClick={() => setHistoryMetric("toman")}
            >
              تومان
            </button>
            <button
              type="button"
              className={historyMetric === "usd" ? "active" : ""}
              onClick={() => setHistoryMetric("usd")}
            >
              دلار
            </button>
          </div>
        </div>
      </section>

      <section className="panel chart-panel">
        <PanelHead title="روند قیمت" meta={metricConfig.label} />
        {chartRows.length ? (
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart data={chartRows} margin={{ top: 24, right: 18, left: 18, bottom: 12 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0f766e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#dce4e5" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "#647174", fontSize: 12 }} />
              <YAxis
                domain={chartPriceDomain}
                tickMargin={12}
                width={96}
                tickFormatter={(value) => numberFormatter.format(Number(value))}
                tick={{ fill: "#647174", fontSize: 12, dx: -40 }}
              />
              <Tooltip
                formatter={(value) => [`${numberFormatter.format(Number(value))} ${metricConfig.suffix}`, "قیمت"]}
                labelFormatter={(value) => `زمان: ${value}`}
              />
              <Area type="monotone" dataKey="price" stroke="#0f766e" strokeWidth={3} fill="url(#priceFill)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text={metricConfig.empty} />
        )}
      </section>

      <section className="panel">
        <PanelHead title="مشاهدات تاریخچه" />
        <HistoryTable rows={[...history].reverse()} />
      </section>
    </div>
  );
}

export function HistoryView() {
  return (
    <Suspense fallback={<p className="empty-state">در حال بارگذاری...</p>}>
      <HistoryContent />
    </Suspense>
  );
}
