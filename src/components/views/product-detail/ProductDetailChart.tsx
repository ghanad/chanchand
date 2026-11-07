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
import { formatNumber, numberFormatter, priceAxisDomain } from "@/lib/formatters";
import { PanelHead } from "@/components/common/PanelHead";
import { EmptyState } from "@/components/common/EmptyState";
import { ChartRow } from "./types";

interface ProductDetailChartProps {
  chartRows: ChartRow[];
  isPublicProduct?: boolean;
  showUsdToggle?: boolean;
  activeMetric: HistoryMetric;
  setChartMetric: (metric: HistoryMetric) => void;
  historyLimit: string;
  setHistoryLimit: (limit: string) => void;
  metricConfig: {
    label: string;
    suffix: string;
    empty: string;
  };
  productKey: string;
}

export function ProductDetailChart({
  chartRows,
  isPublicProduct = false,
  showUsdToggle,
  activeMetric,
  setChartMetric,
  historyLimit,
  setHistoryLimit,
  metricConfig,
  productKey,
}: ProductDetailChartProps) {
  const canToggleUsd = showUsdToggle !== undefined ? showUsdToggle : !isPublicProduct;
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

  const chartPriceDomain = useMemo(() => {
    return visibleRows.length ? priceAxisDomain(visibleRows) : undefined;
  }, [visibleRows]);

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
            ? `${formatNumber(visibleRows.length)} از ${formatNumber(chartRows.length)} نقطه (بزرگ‌نمایی)`
            : `${formatNumber(chartRows.length)} نقطه در نمودار`
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

            {canToggleUsd && (
              <div className="metric-toggle" aria-label="واحد نمایش نمودار">
                <button
                  type="button"
                  className={activeMetric === "toman" ? "active" : ""}
                  onClick={() => setChartMetric("toman")}
                >
                  تومان
                </button>
                <button
                  type="button"
                  className={activeMetric === "usd" ? "active" : ""}
                  onClick={() => setChartMetric("usd")}
                >
                  دلار
                </button>
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
      {visibleRows.length ? (
        <ResponsiveContainer width="100%" height={360}>
          <AreaChart
            data={visibleRows}
            margin={{ top: 24, right: 18, left: 18, bottom: 12 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleZoom}
          >
            <defs>
              <linearGradient id="productPriceFill" x1="0" y1="0" x2="0" y2="1">
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
              formatter={(value) => [
                `${numberFormatter.format(Number(value))} ${metricConfig.suffix}`,
                "قیمت",
              ]}
              labelFormatter={(value) => `زمان: ${value}`}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#0f766e"
              strokeWidth={3}
              fill="url(#productPriceFill)"
            />
            {refAreaLeft && refAreaRight && refAreaLeft !== refAreaRight && (
              <ReferenceArea
                x1={refAreaLeft}
                x2={refAreaRight}
                stroke="#0f766e"
                strokeOpacity={0.6}
                strokeDasharray="4 4"
                fill="#0f766e"
                fillOpacity={0.15}
                isFront
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState text={metricConfig.empty} />
      )}
    </section>
  );
}
