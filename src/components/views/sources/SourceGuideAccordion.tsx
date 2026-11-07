import React from "react";

export function SourceGuideAccordion() {
  return (
    <details className="source-guide-accordion">
      <summary>
        <span className="guide-summary-icon">💡</span>
        <span>راهنمای توسعه‌دهندگان: افزودن آداپتور جدید به سیستم</span>
      </summary>
      <div className="source-guide-content">
        <p>
          هر <strong>منبع قیمت‌گیری (Source)</strong> برای واکشی داده‌های وب‌سایت مقصد از یک <strong>آداپتور (Adapter)</strong> استفاده می‌کند. اگر وب‌سایت موردنظرتان در فهرست آداپتورهای آماده بالا نیست، پیش از ساخت منبع باید آداپتور آن در سورس‌کد پیاده شود:
        </p>
        <ol>
          <li>
            <strong>پیاده‌سازی آداپتور:</strong> کلاسی در مسیر <code>src/lib/adapters/yourSite.ts</code> بسازید که از اینترفیس <code>PriceAdapter</code> پیروی کرده و متد <code>fetch</code> را پیاده کند.
          </li>
          <li>
            <strong>ثبت در رجیستری:</strong> نام آداپتور را در نگاشت <code>adapters</code> در فایل <code>src/lib/adapters/index.ts</code> ثبت کنید.
          </li>
          <li>
            <strong>اعتبارسنجی اسکیما:</strong> شناسه آداپتور را در <code>SourceConfigSchema</code> در فایل <code>src/lib/config.ts</code> مجاز کنید.
          </li>
        </ol>
        <p className="guide-note-muted">
          نکته: برای فروشگاه‌های عمومی که با سلکتور CSS کار می‌کنند از آداپتور <code>generic_html</code> و برای جداول قیمت خودرو و بازار ایران‌جیب از آداپتور <code>iranjib</code> استفاده کنید (با تنظیم قیمت به تومان و استخراج پیش‌فرض ستون قیمت بازار).
        </p>
      </div>
    </details>
  );
}
