import React from "react";
import { PackageRow } from "@/lib/types";
import { formatNumber } from "@/lib/formatters";
import { EmptyState } from "@/components/common/EmptyState";

interface WalletPackagesGridProps {
  packagesSectionRef: React.RefObject<HTMLDivElement | null>;
  loading: boolean;
  packages: PackageRow[];
  slotPrice: number;
}

export function WalletPackagesGrid({
  packagesSectionRef,
  loading,
  packages,
  slotPrice,
}: WalletPackagesGridProps) {
  return (
    <section
      ref={packagesSectionRef}
      id="packages-section"
      className="wallet-packages-section"
      aria-label="بسته‌های افزایش ظرفیت پایش"
    >
      <div className="wallet-section-header">
        <div className="wallet-section-titles">
          <h2>
            <span aria-hidden="true">🎁</span>
            <span>بسته‌های افزایش ظرفیت پایش ماهانه (پرداخت آنلاین)</span>
          </h2>
          <p>
            با خرید هر بسته، اسلات‌های پایش ماهانه (۳۰ روزه) فوراً به حسابتان افزوده می‌شوند و از طریق کلیه کارت‌های عضو شتاب قابل پرداخت هستند.
          </p>
        </div>

        <div style={{ fontSize: "12px", color: "var(--muted)" }}>
          هزینه پایه هر اسلات: {formatNumber(slotPrice)} تومان ماهانه
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "48px 0", textAlign: "center", fontSize: "12.5px", color: "var(--muted)" }}>
          در حال بارگذاری بسته‌های ارتقا...
        </div>
      ) : packages.length === 0 ? (
        <EmptyState text="در حال حاضر بسته‌ای برای خرید فعال نیست." />
      ) : (
        <div className="wallet-packages-grid">
          {packages.map((pkg, idx) => {
            // Highlight middle package or package with slots >= 5 as featured
            const isFeatured = pkg.slots >= 5 && (packages.length <= 3 ? idx === 1 : true);
            const pricePerSlot = Math.round(pkg.price_toman / Math.max(1, pkg.slots));

            return (
              <div
                key={pkg.id}
                className={`wallet-package-card ${isFeatured ? "featured" : ""}`}
              >
                {isFeatured && (
                  <div className="wallet-package-popular-ribbon">
                    پیشنهادی و پرطرفدار
                  </div>
                )}

                <div>
                  <div className="wallet-package-top">
                    <h3 className="wallet-package-title">{pkg.title}</h3>
                    <span className="wallet-package-slots-tag">
                      +{formatNumber(pkg.slots)} محصول (ماهانه)
                    </span>
                  </div>

                  <p className="wallet-package-desc">
                    {pkg.description || `افزایش ظرفیت پایش شما به میزان ${formatNumber(pkg.slots)} محصول به مدت ۳۰ روز با امکان تمدید.`}
                  </p>
                </div>

                <div>
                  <div className="wallet-package-pricing-wrap">
                    <div className="wallet-package-price-row">
                      <strong>{formatNumber(pkg.price_toman)}</strong>
                      <span>تومان / ماهانه</span>
                    </div>
                    <div className="wallet-package-per-slot-text">
                      هر اسلات فقط: {formatNumber(pricePerSlot)} تومان
                    </div>
                  </div>

                  <ul className="wallet-package-features-list">
                    <li className="wallet-package-feature-item">
                      <span aria-hidden="true">✓</span>
                      <span>فعال‌سازی آنی و خودکار پس از پرداخت</span>
                    </li>
                    <li className="wallet-package-feature-item">
                      <span aria-hidden="true">✓</span>
                      <span>اعتبار ۳۰ روزه با امکان تمدید ماهانه آسان</span>
                    </li>
                    <li className="wallet-package-feature-item">
                      <span aria-hidden="true">✓</span>
                      <span>پایش منظم نرخ‌ها و آرشیو تغییرات</span>
                    </li>
                  </ul>

                  <button
                    type="button"
                    className={`btn btn-primary wallet-package-buy-btn ${isFeatured ? "" : "btn-secondary"}`}
                  >
                    <span>خرید و پرداخت آنلاین</span>
                    <span aria-hidden="true">💳</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
