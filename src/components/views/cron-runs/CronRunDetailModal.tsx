import React, { useMemo } from "react";
import { CronRunDetail } from "@/types/dashboard";
import { formatNumber, statusText, formatDuration } from "@/lib/formatters";
import { Modal } from "@/components/common/Modal";
import { StatusPill } from "@/components/common/StatusPill";
import { EmptyState } from "@/components/common/EmptyState";
import { DateTime } from "@/components/common/DateTime";
import { SourceBadge } from "./SourceBadge";

interface CronRunDetailModalProps {
  selectedRunId: number | null;
  runDetail: CronRunDetail | null;
  loadingDetail: boolean;
  detailTab: "errors" | "snapshots";
  setDetailTab: (tab: "errors" | "snapshots") => void;
  onClose: () => void;
}

export function CronRunDetailModal({
  selectedRunId,
  runDetail,
  loadingDetail,
  detailTab,
  setDetailTab,
  onClose,
}: CronRunDetailModalProps) {
  // Parse trigger details json safely
  const parsedDetails = useMemo(() => {
    if (!runDetail?.run?.trigger_details) return null;
    try {
      return JSON.parse(runDetail.run.trigger_details);
    } catch {
      return { raw: runDetail.run.trigger_details };
    }
  }, [runDetail]);

  return (
    <Modal
      isOpen={selectedRunId !== null}
      onClose={onClose}
      title={`جزئیات و خروجی اجرای شماره ${selectedRunId ? formatNumber(selectedRunId) : ""}`}
      maxWidth="760px"
    >
      {loadingDetail && (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner-sm" style={{ marginLeft: "8px" }} />
          در حال بارگذاری نتایج و خطاهای اجرا...
        </div>
      )}

      {!loadingDetail && runDetail && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* اطلاعات پایه و مشخصات اجرا */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: "10px",
              background: "var(--surface-soft)",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid var(--line)",
            }}
          >
            <div>
              <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>منبع اجرا:</span>
              <strong style={{ fontSize: "12.5px" }}>
                <SourceBadge source={runDetail.run.trigger_source} />
              </strong>
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>وضعیت:</span>
              <StatusPill text={statusText(runDetail.run.status)} tone={runDetail.run.status} />
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>زمان شروع:</span>
              <DateTime value={runDetail.run.started_at} showIcon className="text-xs" />
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>مدت زمان:</span>
              <span style={{ fontSize: "12px" }}>{formatDuration(runDetail.run.duration_ms)}</span>
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>نتیجه نهایی:</span>
              <span style={{ fontSize: "12px", fontWeight: 600 }}>
                <span style={{ color: "var(--ok)" }}>{formatNumber(runDetail.run.success_count)} موفق</span> /{" "}
                <span style={{ color: runDetail.run.error_count > 0 ? "var(--danger)" : "var(--muted)" }}>
                  {formatNumber(runDetail.run.error_count)} خطا
                </span>
              </span>
            </div>
          </div>

          {/* جزئیات فراخوانی در صورت وجود */}
          {parsedDetails && (
            <div
              style={{
                fontSize: "12px",
                background: "var(--surface)",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--line)",
                color: "var(--muted)",
                lineHeight: 1.6,
              }}
            >
              {parsedDetails.user_agent && (
                <div>
                  <strong>User-Agent:</strong> <span style={{ direction: "ltr", display: "inline-block" }}>{parsedDetails.user_agent}</span>
                </div>
              )}
              {parsedDetails.ip && (
                <div>
                  <strong>IP فراخوان:</strong> <span style={{ direction: "ltr", display: "inline-block" }}>{parsedDetails.ip}</span>
                </div>
              )}
              {parsedDetails.product_key && (
                <div>
                  <strong>محصول مشخص‌شده:</strong> {parsedDetails.product_key}
                </div>
              )}
              {parsedDetails.initiated_by && (
                <div>
                  <strong>کاربر شروع‌کننده:</strong> {parsedDetails.initiated_by}
                </div>
              )}
            </div>
          )}

          {/* تب‌های نتایج (خطاها / قیمت‌ها) */}
          <div className="status-filter-pills" role="tablist" style={{ width: "fit-content" }}>
            <button
              type="button"
              role="tab"
              aria-selected={detailTab === "errors"}
              className={`filter-pill-btn ${detailTab === "errors" ? "is-active" : ""}`}
              onClick={() => setDetailTab("errors")}
            >
              خطاهای ثبت‌شده ({formatNumber(runDetail.errors.length)})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={detailTab === "snapshots"}
              className={`filter-pill-btn ${detailTab === "snapshots" ? "is-active" : ""}`}
              onClick={() => setDetailTab("snapshots")}
            >
              قیمت‌های دریافت‌شده ({formatNumber(runDetail.snapshots.length)})
            </button>
          </div>

          {/* محتوای تب خطاها */}
          {detailTab === "errors" && (
            <div>
              {runDetail.errors.length === 0 ? (
                <EmptyState text="هیچ خطایی در این اجرا ثبت نشده است و تمامی اهداف با موفقیت انجام شده‌اند." />
              ) : (
                <div className="product-table-wrap" style={{ maxHeight: "320px", overflowY: "auto" }}>
                  <table className="product-compact-table" aria-label="خطاهای ثبت شده در اجرا">
                    <thead>
                      <tr>
                        <th>منبع</th>
                        <th>محصول</th>
                        <th>نوع خطا</th>
                        <th>پیام و علت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runDetail.errors.map((err) => (
                        <tr key={err.id} className="product-table-row">
                          <td>
                            <code>{err.source_key}</code>
                          </td>
                          <td>
                            <strong>{err.product_key}</strong>
                          </td>
                          <td>
                            <span className="status-pill tone-failed">{err.error_type}</span>
                          </td>
                          <td style={{ fontSize: "12px", color: "var(--danger)", maxWidth: "260px", wordBreak: "break-word" }}>
                            {err.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* محتوای تب قیمت‌های دریافتی */}
          {detailTab === "snapshots" && (
            <div>
              {runDetail.snapshots.length === 0 ? (
                <EmptyState text="هیچ قیمتی در این نوبت ثبت نشده است." />
              ) : (
                <div className="product-table-wrap" style={{ maxHeight: "320px", overflowY: "auto" }}>
                  <table className="product-compact-table" aria-label="قیمت‌های دریافت شده در اجرا">
                    <thead>
                      <tr>
                        <th>محصول</th>
                        <th>منبع</th>
                        <th>قیمت (تومان)</th>
                        <th>وضعیت موجودی</th>
                        <th>زمان مشاهده</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runDetail.snapshots.map((snap) => (
                        <tr key={snap.id} className="product-table-row">
                          <td>
                            <strong>{snap.title || snap.product_key}</strong>
                          </td>
                          <td>
                            <code>{snap.source_key}</code>
                          </td>
                          <td>
                            {snap.price_toman ? (
                              <strong style={{ color: "var(--accent)" }}>{formatNumber(snap.price_toman)} تومان</strong>
                            ) : (
                              <span className="muted-cell">-</span>
                            )}
                          </td>
                          <td>
                            <StatusPill
                              text={snap.availability === "in_stock" ? "موجود" : snap.availability}
                              tone={snap.availability}
                            />
                          </td>
                          <td style={{ fontSize: "11.5px", color: "var(--muted)" }}>
                            <DateTime value={snap.observed_at} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              بستن
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
