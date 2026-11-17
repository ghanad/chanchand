import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HistoryMetric } from "@/types/dashboard";
import {
  formatNumber,
  numberFormatter,
  priceAxisDomain,
  formatPriceAxis,
  formatGoldGram,
  formatGoldGramAxis,
  goldGramAxisDomain,
} from "@/lib/formatters";
import { PanelHead } from "@/components/common/PanelHead";
import { EmptyState } from "@/components/common/EmptyState";
import { countPricedPoints, hasOutOfStockPoints, pricedPoints } from "@/lib/chartRows";
import { ChartRow } from "./types";

interface ProductDetailChartProps {
  chartRows: ChartRow[];
  isPublicProduct?: boolean;
  showUsdToggle?: boolean;
  showGoldToggle?: boolean;
  activeMetric: HistoryMetric;
  setChartMetric: (metric: HistoryMetric) => void;
  historyLimit: string;
  setHistoryLimit: (limit: string) => void;
  metricConfig: {
    label: string;
    name: string;
    suffix: string;
    empty: string;
  };
  productKey: string;
}

interface ChartTooltipContentProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ payload?: ChartRow }>;
  rows: ChartRow[];
  activeMetric: HistoryMetric;
  metricConfig: { name: string; suffix: string };
}

/**
 * Custom tooltip so an out-of-stock point explains itself instead of rendering
 * a bare `null`. Recharts may omit the payload entry for a null value, so the
 * row is looked up by its x-axis label as a fallback.
 */
function ChartTooltipContent({
  active,
  label,
  payload,
  rows,
  activeMetric,
  metricConfig,
}: ChartTooltipContentProps) {
  if (!active) return null;

  const point =
    payload?.[0]?.payload ?? rows.find((row) => row.time === String(label ?? ""));
  if (!point) return null;

  // A point is only plottable when it is not marked unavailable and carries a
  // finite price; everything else is reported as "ناموجود".
  const price = point.reason === "out_of_stock" ? null : point.price;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-time">{label}</div>
      {price === null ? (
        <div className="chart-tooltip-row primary">ناموجود</div>
      ) : (
        <div className="chart-tooltip-row primary">
          <span>{metricConfig.name}</span>
          <span>
            {activeMetric === "gold"
              ? formatGoldGram(price)
              : numberFormatter.format(price)}{" "}
            {metricConfig.suffix}
          </span>
        </div>
      )}
    </div>
  );
}

export function ProductDetailChart({
  chartRows,
  isPublicProduct = false,
  showUsdToggle,
  showGoldToggle,
  activeMetric,
  setChartMetric,
  historyLimit,
  setHistoryLimit,
  metricConfig,
  productKey,
}: ProductDetailChartProps) {
  const canToggleUsd = showUsdToggle !== undefined ? showUsdToggle : !isPublicProduct;
  const canToggleGold = showGoldToggle !== undefined ? showGoldToggle : !isPublicProduct;
  // Zoom & selection state
  const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragEndIndex, setDragEndIndex] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<{ startIndex: number; endIndex: number } | null>(null);

  // Reset zoom if chart metric, history limit or product changes
  useEffect(() => {
    setZoomRange(null);
  }, [activeMetric, historyLimit, productKey]);

  const visibleRows = useMemo(() => {
    if (!zoomRange) return chartRows;
    const start = Math.max(0, Math.min(zoomRange.startIndex, chartRows.length - 1));
    const end = Math.max(start, Math.min(zoomRange.endIndex, chartRows.length - 1));
    return chartRows.slice(start, end + 1);
  }, [chartRows, zoomRange]);

  // Null (out-of-stock) points must never reach the axis-domain helpers:
  // Math.min coerces null to 0 and the chart would be squashed to the x-axis.
  const visiblePricedRows = useMemo(() => pricedPoints(visibleRows), [visibleRows]);
  const totalPricedPoints = useMemo(() => countPricedPoints(chartRows), [chartRows]);
  const showOutOfStockLegend = useMemo(() => hasOutOfStockPoints(visibleRows), [visibleRows]);
  // Every row that is not priced is an explicit out-of-stock point (rows with a
  // missing rate are dropped before they reach the chart).
  const visibleOutOfStockCount = visibleRows.length - visiblePricedRows.length;
  const totalOutOfStockCount = chartRows.length - totalPricedPoints;

  const chartPriceDomain = useMemo(() => {
    if (!visiblePricedRows.length) return undefined;
    return activeMetric === "gold"
      ? goldGramAxisDomain(visiblePricedRows)
      : priceAxisDomain(visiblePricedRows);
  }, [visiblePricedRows, activeMetric]);

  const priceSpread = useMemo(() => {
    if (!chartPriceDomain) return undefined;
    return chartPriceDomain[1] - chartPriceDomain[0];
  }, [chartPriceDomain]);

  const chartColor = activeMetric === "gold" ? "#b45309" : "#0f766e";
  const chartFillId = `productPriceFill-${activeMetric}`;

  const formatAxisTick = (value: number) =>
    activeMetric === "gold"
      ? formatGoldGramAxis(Number(value), priceSpread)
      : formatPriceAxis(Number(value), priceSpread);

  const handleMouseDown = useCallback((e: any) => {
    if (!e) return;
    const label = e.activeLabel;
    const index = typeof e.activeTooltipIndex === "number" ? e.activeTooltipIndex : null;
    if (label !== undefined && label !== null) {
      setRefAreaLeft(label);
      setRefAreaRight(null);
      setDragStartIndex(index);
      setDragEndIndex(null);
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: any) => {
      if (!refAreaLeft || !e) return;
      const label = e.activeLabel;
      const index = typeof e.activeTooltipIndex === "number" ? e.activeTooltipIndex : null;
      if (label !== undefined && label !== null) {
        setRefAreaRight(label);
        setDragEndIndex(index);
      }
    },
    [refAreaLeft]
  );

  const handleZoom = useCallback(() => {
    if (refAreaLeft && refAreaRight && refAreaLeft !== refAreaRight) {
      let start = dragStartIndex;
      let end = dragEndIndex;

      if (start === null || end === null || start === end) {
        const idx1 = visibleRows.findIndex((r) => r.time === refAreaLeft);
        let idx2 = -1;
        for (let i = visibleRows.length - 1; i >= 0; i--) {
          if (visibleRows[i].time === refAreaRight) {
            idx2 = i;
            break;
          }
        }
        if (idx1 !== -1 && idx2 !== -1) {
          start = idx1;
          end = idx2;
        }
      }

      if (start !== null && end !== null && start !== end) {
        const minIdx = Math.min(start, end);
        const maxIdx = Math.max(start, end);

        if (maxIdx - minIdx >= 1) {
          const currentOffset = zoomRange ? zoomRange.startIndex : 0;
          const newStart = currentOffset + minIdx;
          const newEnd = currentOffset + maxIdx;

          setZoomRange({
            startIndex: Math.max(0, newStart),
            endIndex: Math.min(chartRows.length - 1, newEnd),
          });
        }
      }
    }

    setRefAreaLeft(null);
    setRefAreaRight(null);
    setDragStartIndex(null);
    setDragEndIndex(null);
  }, [refAreaLeft, refAreaRight, dragStartIndex, dragEndIndex, visibleRows, chartRows.length, zoomRange]);

  const handleResetZoom = useCallback(() => {
    setZoomRange(null);
    setRefAreaLeft(null);
    setRefAreaRight(null);
    setDragStartIndex(null);
    setDragEndIndex(null);
  }, []);

  useEffect(() => {
    if (!refAreaLeft) return;

    const onGlobalMouseUp = () => {
      handleZoom();
    };

    window.addEventListener("mouseup", onGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", onGlobalMouseUp);
    };
  }, [refAreaLeft, handleZoom]);

  return (
    <section className="panel chart-panel">
      <PanelHead
        title="روند قیمت محصول"
        meta={
          zoomRange
            ? `${formatNumber(visiblePricedRows.length)} از ${formatNumber(totalPricedPoints)} نقطه قیمت${
                visibleOutOfStockCount ? ` · ${formatNumber(visibleOutOfStockCount)} ناموجود` : ""
              } (بزرگ‌نمایی)`
            : `${formatNumber(totalPricedPoints)} نقطه قیمت${
                totalOutOfStockCount ? ` · ${formatNumber(totalOutOfStockCount)} ناموجود` : ""
              }`
        }
        action={
          <div className="chart-toolbar-actions">
            {zoomRange && (
              <button
                type="button"
                className="chart-reset-zoom-btn"
                onClick={handleResetZoom}
                title="بازنشانی بزرگنمایی به کل بازه"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                <span>بازنشانی بزرگنمایی</span>
              </button>
            )}

            {(canToggleUsd || canToggleGold) && (
              <div className="metric-toggle" aria-label="واحد نمایش نمودار">
                <button
                  type="button"
                  className={activeMetric === "toman" ? "active" : ""}
                  onClick={() => setChartMetric("toman")}
                >
                  تومان
                </button>
                {canToggleUsd && (
                  <button
                    type="button"
                    className={activeMetric === "usd" ? "active" : ""}
                    onClick={() => setChartMetric("usd")}
                  >
                    دلار
                  </button>
                )}
                {canToggleGold && (
                  <button
                    type="button"
                    className={activeMetric === "gold" ? "active" : ""}
                    onClick={() => setChartMetric("gold")}
                    title="نمودار بر حسب گرم طلای ۱۸ عیار"
                  >
                    گرم طلا
                  </button>
                )}
              </div>
            )}

            <select
              className="compact-select"
              value={historyLimit}
              onChange={(e) => setHistoryLimit(e.target.value)}
              aria-label="تعداد مشاهدات نمودار"
            >
              <option value="50">۵۰ مشاهده اخیر</option>
              <option value="100">۱۰۰ مشاهده اخیر</option>
              <option value="200">۲۰۰ مشاهده اخیر</option>
              <option value="500">۵۰۰ مشاهده اخیر</option>
            </select>
          </div>
        }
      />
      {visiblePricedRows.length ? (
        <ResponsiveContainer width="100%" height={360}>
          <AreaChart
            data={visibleRows}
            margin={{ top: 24, right: 18, left: 18, bottom: 12 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleZoom}
          >
            <defs>
              <linearGradient id={chartFillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chartColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#dce4e5" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: "#647174", fontSize: 12 }} />
            <YAxis
              domain={chartPriceDomain}
              tickMargin={8}
              width={88}
              tickFormatter={formatAxisTick}
              tick={{
                fill: "#647174",
                fontSize: 12,
                textAnchor: "start",
                style: { direction: "rtl" },
              }}
            />
            <Tooltip
              content={
                <ChartTooltipContent
                  rows={visibleRows}
                  activeMetric={activeMetric}
                  metricConfig={metricConfig}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={chartColor}
              strokeWidth={3}
              fill={`url(#${chartFillId})`}
              connectNulls={false}
            />
            {refAreaLeft && refAreaRight && refAreaLeft !== refAreaRight && (
              <ReferenceArea
                x1={refAreaLeft}
                x2={refAreaRight}
                stroke={chartColor}
                strokeOpacity={0.6}
                strokeDasharray="4 4"
                fill={chartColor}
                fillOpacity={0.15}
                isFront
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState
          text={
            visibleRows.length
              ? "در این بازه کالا ناموجود بوده و قیمتی ثبت نشده است."
              : metricConfig.empty
          }
        />
      )}
      {showOutOfStockLegend && visiblePricedRows.length > 0 && (
        <p className="chart-oos-legend">
          <span className="chart-oos-swatch" aria-hidden="true" />
          شکاف در خط نمودار یعنی کالا در آن بازه ناموجود بوده است.
        </p>
      )}
    </section>
  );
}
