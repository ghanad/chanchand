import React, { useState } from "react";

const cronSampleCommand = `0 * * * * curl -s -X POST http://localhost:8000/api/trigger-run -H "Authorization: Bearer <TRIGGER_API_KEY>" >> /var/log/price-getter-cron.log 2>&1`;
const curlSampleCommand = `curl -s -X POST http://localhost:8000/api/trigger-run \\
  -H "Authorization: Bearer <TRIGGER_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"source": "cron"}'`;

export function CronInstructions() {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopyFeedback(label);
      setTimeout(() => setCopyFeedback(null), 2500);
    }
  };

  return (
    <section className="panel">
      <details className="source-guide-accordion">
        <summary>
          <span>راهنمای زمان‌بندی خودکار در سیستم‌عامل (Linux Crontab / cURL Webhook)</span>
          {copyFeedback && (
            <span className="status-pill tone-success" style={{ marginRight: "auto" }}>
              {copyFeedback} کپی شد!
            </span>
          )}
        </summary>
        <div className="source-guide-content" style={{ marginTop: "12px" }}>
          <p style={{ margin: "0 0 10px 0", fontSize: "13px", lineHeight: 1.7 }}>
            برای اجرای خودکار فرآیند جمع‌آوری قیمت‌ها، کافیست اندپوینت همگام <code>/api/trigger-run</code> را از طریق{" "}
            <code>crontab</code> سرور لینوکس یا سرویس‌های زمان‌بندی آنلاین (مانند cron-job.org) به صورت دوره‌ای صدا بزنید.
          </p>
          <div style={{ display: "grid", gap: "10px", margin: "10px 0" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <strong style={{ fontSize: "12px" }}>دستور پیشنهادی برای Crontab (اجرای ساعتی — جمع‌آوری محصولات عمومی بین ۸ تا ۲۳ و محصولات اختصاصی روزانه):</strong>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ fontSize: "11px", padding: "2px 8px" }}
                  onClick={() => handleCopy(cronSampleCommand, "دستور Crontab")}
                >
                  کپی دستور Crontab
                </button>
              </div>
              <code style={{ display: "block", padding: "8px 12px", whiteSpace: "pre-wrap", direction: "ltr" }}>
                {cronSampleCommand}
              </code>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <strong style={{ fontSize: "12px" }}>نمونه تست مستقیم با cURL:</strong>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ fontSize: "11px", padding: "2px 8px" }}
                  onClick={() => handleCopy(curlSampleCommand, "دستور cURL")}
                >
                  کپی دستور cURL
                </button>
              </div>
              <code style={{ display: "block", padding: "8px 12px", whiteSpace: "pre-wrap", direction: "ltr" }}>
                {curlSampleCommand}
              </code>
            </div>
          </div>
          <p className="guide-note-muted">
            نکته: در صورت تمایل می‌توانید پارامتر <code>product_key</code> را جهت قیمت‌گیری فقط برای یک کالای مشخص به صورت کوئری استرینگ یا بادی JSON ارسال کنید.
          </p>
        </div>
      </details>
    </section>
  );
}
