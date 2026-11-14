import React from "react";
import { describeCollectionSchedule } from "@/lib/schedule";

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hourStr = String(i).padStart(2, "0") + ":00";
  let desc = "";
  if (i === 0) desc = " (۱۲ شب)";
  else if (i === 1) desc = " (۱ بامداد)";
  else if (i >= 2 && i <= 4) desc = ` (${i} بامداد)`;
  else if (i >= 5 && i <= 11) desc = ` (${i} صبح)`;
  else if (i === 12) desc = " (۱۲ ظهر)";
  else if (i >= 13 && i <= 16) desc = ` (${i - 12} بعدازظهر)`;
  else if (i >= 17 && i <= 19) desc = ` (${i - 12} عصر)`;
  else desc = ` (${i - 12} شب)`;

  return {
    value: i,
    label: `${hourStr}${desc}`,
  };
});

interface ProductActiveHoursFieldProps {
  startHour: number;
  endHour: number;
  onChangeStart: (hour: number) => void;
  onChangeEnd: (hour: number) => void;
  /** Market products are polled on every run, so their window cannot be changed. */
  alwaysOn?: boolean;
}

export function ProductActiveHoursField({
  startHour,
  endHour,
  onChangeStart,
  onChangeEnd,
  alwaysOn = false,
}: ProductActiveHoursFieldProps) {
  const schedule = describeCollectionSchedule(
    alwaysOn ? 0 : startHour,
    alwaysOn ? 23 : endHour
  );
  const is24Hours = schedule.isFullDay;

  return (
    <div
      style={{
        marginTop: "8px",
        marginBottom: "12px",
        padding: "12px",
        background: "var(--surface-sunken, rgba(0, 0, 0, 0.03))",
        borderRadius: "8px",
        border: "1px dashed var(--border-color, rgba(140, 140, 140, 0.25))",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>
          بازه زمانی جمع‌آوری قیمت (ساعات شبانه‌روز)
        </div>
        {alwaysOn ? (
          <span
            style={{
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "4px",
              border: "1px solid #0f766e",
              background: "rgba(15, 118, 110, 0.12)",
              color: "#0f766e",
              fontWeight: 600,
            }}
          >
            ✓ ۲۴ ساعته (همیشگی)
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              onChangeStart(0);
              onChangeEnd(23);
            }}
            style={{
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "4px",
              cursor: "pointer",
              border: is24Hours ? "1px solid #0f766e" : "1px solid var(--border-color, #ccc)",
              background: is24Hours ? "rgba(15, 118, 110, 0.12)" : "transparent",
              color: is24Hours ? "#0f766e" : "var(--text-muted, #666)",
              fontWeight: is24Hours ? 600 : 400,
            }}
          >
            {is24Hours ? "✓ ۲۴ ساعته (فعال)" : "تنظیم روی ۲۴ ساعته"}
          </button>
        )}
      </div>
      {alwaysOn ? (
        <div style={{ fontSize: "11px", color: "var(--text-muted, #71717a)", lineHeight: 1.6 }}>
          این کالا از منابع بازار (دلار، طلا، سکه) است و به صورت{" "}
          <strong>۲۴ ساعته (۰۰:۰۰ تا ۲۳:۰۰)</strong> در هر اجرا پایش می‌شود؛ بازه ساعتی
          برای آن اعمال نمی‌شود.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <label style={{ fontSize: "12px", margin: 0 }}>
              از ساعت (شروع)
              <select
                value={startHour}
                onChange={(e) => onChangeStart(Number(e.target.value))}
                style={{ width: "100%", marginTop: "4px" }}
              >
                {HOUR_OPTIONS.map((opt) => (
                  <option key={`start-${opt.value}`} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: "12px", margin: 0 }}>
              تا ساعت (پایان)
              <select
                value={endHour}
                onChange={(e) => onChangeEnd(Number(e.target.value))}
                style={{ width: "100%", marginTop: "4px" }}
              >
                {HOUR_OPTIONS.map((opt) => (
                  <option key={`end-${opt.value}`} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted, #71717a)", lineHeight: 1.4 }}>
            {is24Hours
              ? "این کالا به صورت ۲۴ ساعته در تمام ساعات شبانه‌روز (۰۰:۰۰ تا ۲۳:۰۰) جمع‌آوری خواهد شد."
              : `قیمت این کالا به مدت ${schedule.durationLabel} در بازه ${schedule.rangeLabel} استخراج خواهد شد.`}
          </div>
        </>
      )}
    </div>
  );
}
