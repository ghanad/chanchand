import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "../../common/Modal";
import { ProductActiveHoursField } from "./ProductActiveHoursField";
import { SourceRow } from "../../../types/dashboard";
import { ProductFormState } from "./types";
import { requestJson } from "@/lib/api-client";
import { formatNumber } from "@/lib/formatters";
import { useDashboard } from "@/context/DashboardContext";

interface PreviewColor {
  id: string;
  label: string | null;
  hex: string | null;
  priceIrr: number | null;
  sellerCount: number;
  inStock: boolean;
}

interface ProductPreview {
  supported: boolean;
  product_id?: string;
  title?: string | null;
  brand?: string | null;
  image_url?: string | null;
  floor_price_irr?: number | null;
  floor_color_label?: string | null;
  in_stock?: boolean;
  colors?: PreviewColor[];
  error?: string;
}

function toman(priceIrr: number | null | undefined): string {
  if (priceIrr === null || priceIrr === undefined) return "—";
  return `${formatNumber(Math.round(priceIrr / 10))} تومان`;
}

interface IranjibItemData {
  company: string;
  name: string;
  id: string | null;
  href: string | null;
  marketPrice: string;
  factoryPrice: string | null;
}

interface IranjibResponse {
  ok: boolean;
  url: string;
  companies: string[];
  items: IranjibItemData[];
}

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  form: ProductFormState;
  setForm: React.Dispatch<React.SetStateAction<ProductFormState>>;
  sources: SourceRow[];
  isAdmin: boolean;
  isBusy: boolean;
}

export function AddProductModal({
  isOpen,
  onClose,
  onSubmit,
  form,
  setForm,
  sources,
  isAdmin,
  isBusy,
}: AddProductModalProps) {
  const { currentUser } = useDashboard();
  const quota = currentUser?.quota;
  const [mode, setMode] = useState<"general" | "car">("general");
  const [carItems, setCarItems] = useState<IranjibItemData[]>([]);
  const [carCompanies, setCarCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("همه");
  const [carSearch, setCarSearch] = useState<string>("");
  const [selectedCar, setSelectedCar] = useState<IranjibItemData | null>(null);
  const [isLoadingCars, setIsLoadingCars] = useState<boolean>(false);
  const [preview, setPreview] = useState<ProductPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [iranjibUrl, setIranjibUrl] = useState<string>(
    "https://www.iranjib.ir/showgroup/45/%D9%82%DB%8C%D9%85%D8%AA-%D8%AE%D9%88%D8%AF%D8%B1%D9%88-%D8%AA%D9%88%D9%84%DB%8C%D8%AF-%D8%AF%D8%A7%D8%AE%D9%84/"
  );

  // Auto-switch mode or reset when modal opens
  useEffect(() => {
    if (isOpen) {
      if (form.source_key === "iranjib" || form.url.includes("iranjib.ir")) {
        setMode("car");
      }
    } else {
      setSelectedCar(null);
      setCarSearch("");
    }
  }, [isOpen, form.source_key, form.url]);

  // Load cars when switching to car mode
  useEffect(() => {
    if (!isOpen || mode !== "car" || carItems.length > 0) return;

    let isMounted = true;
    setIsLoadingCars(true);
    requestJson<IranjibResponse>("/api/sources/iranjib/items")
      .then((data) => {
        if (!isMounted) return;
        if (data && data.items) {
          setCarItems(data.items);
          setCarCompanies(data.companies || ["همه"]);
          if (data.url) setIranjibUrl(data.url);
        }
      })
      .catch((err) => {
        console.error("Failed to load Iranjib cars:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingCars(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, mode, carItems.length]);

  const isDigikalaUrl = useMemo(() => {
    const url = form.url.trim();
    try {
      const host = new URL(url).hostname.toLowerCase();
      return /(^|\.)digikala\.com$/.test(host) && /(dkp-|\/product\/)\d+/i.test(url);
    } catch {
      return false;
    }
  }, [form.url]);

  // Preview a Digikala link so the user can choose "cheapest anywhere" or a
  // specific colour before the product is created.
  useEffect(() => {
    if (!isOpen || mode !== "general") {
      setPreview(null);
      setPreviewError(null);
      setIsLoadingPreview(false);
      return;
    }

    const url = form.url.trim();

    if (!isDigikalaUrl) {
      setPreview(null);
      setPreviewError(null);
      setIsLoadingPreview(false);
      return;
    }

    let cancelled = false;
    setIsLoadingPreview(true);
    setPreviewError(null);

    const timer = setTimeout(() => {
      requestJson<ProductPreview>(`/api/products/preview?url=${encodeURIComponent(url)}`)
        .then((data) => {
          if (cancelled) return;
          if (!data || !data.supported) {
            setPreview(null);
            return;
          }
          if (data.error) {
            setPreview(null);
            setPreviewError(data.error);
            return;
          }
          setPreview(data);
          setForm((current) => {
            const next = { ...current };
            if (!next.title.trim() && data.title) next.title = data.title;
            // The colour belongs to the previous link: drop it when it is gone.
            if (next.color_id && !(data.colors || []).some((c) => c.id === next.color_id)) {
              next.color_id = null;
              next.color_label = null;
            }
            return next;
          });
        })
        .catch((err) => {
          if (!cancelled) {
            setPreviewError(err instanceof Error ? err.message : "خطا در دریافت پیش‌نمایش محصول");
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoadingPreview(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, mode, isDigikalaUrl, form.url, setForm]);

  // Filter cars by company and search query
  const filteredCars = useMemo(() => {
    return carItems.filter((car) => {
      if (selectedCompany !== "همه" && car.company !== selectedCompany) {
        return false;
      }
      if (carSearch.trim()) {
        const query = carSearch.trim().toLowerCase();
        return (
          car.name.toLowerCase().includes(query) ||
          car.company.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [carItems, selectedCompany, carSearch]);

  const handleSelectCar = (carName: string) => {
    const found = carItems.find((c) => c.name === carName);
    if (!found) return;

    setSelectedCar(found);
    setForm((current) => ({
      ...current,
      title: found.name,
      url: iranjibUrl,
      source_key: "iranjib",
      adapter_settings: {
        item_name: found.name,
        ...(found.company ? { company: found.company } : {}),
        ...(found.id ? { item_id: found.id } : {}),
      },
    }));
  };

  const handleSwitchMode = (newMode: "general" | "car") => {
    setMode(newMode);
    if (newMode === "car") {
      setForm((current) => ({
        ...current,
        source_key: "iranjib",
        url: iranjibUrl,
      }));
    } else {
      setSelectedCar(null);
      setForm((current) => ({
        ...current,
        adapter_settings: undefined,
      }));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="افزودن محصول جدید">
      <div className="product-type-tabs">
        <button
          type="button"
          className={`product-type-tab ${mode === "general" ? "active" : ""}`}
          onClick={() => handleSwitchMode("general")}
        >
          <span>🛒</span>
          <span>کالای عمومی (دیجی‌کالا و سایر)</span>
        </button>
        <button
          type="button"
          className={`product-type-tab ${mode === "car" ? "active" : ""}`}
          onClick={() => handleSwitchMode("car")}
        >
          <span>🚗</span>
          <span>خودرو داخلی (ایران‌جیب)</span>
        </button>
      </div>

      <form className="modal-form" onSubmit={onSubmit}>
        {!isAdmin && quota && (
          <div className="add-product-slot-hint">
            {quota.remaining > 0 ? (
              <>
                <span aria-hidden="true">🎟️</span>
                <span>
                  این محصول یکی از <strong>{formatNumber(quota.remaining)}</strong> اسلات خالی شما را اشغال می‌کند.
                  {quota.freeUsed !== undefined && quota.freeUsed < quota.freeLimit
                    ? " از سهمیه رایگان دائمی استفاده می‌شود."
                    : " پنجره پایش آن ۳۰ روز از همین لحظه شروع می‌شود و پس از آن باید تمدید شود."}
                </span>
              </>
            ) : (
              <>
                <span aria-hidden="true">⚠️</span>
                <span>
                  هیچ اسلات خالی ندارید. برای افزودن محصول جدید ابتدا یک اسلات ۳۰ روزه از کیف پول خریداری کنید.
                </span>
              </>
            )}
          </div>
        )}

        {mode === "car" ? (
          <div className="car-picker-box">
            <div className="car-picker-header">
              <span>انتخاب مستقیم خودرو از جدول قیمت ایران‌جیب</span>
              {isLoadingCars && <span>در حال دریافت لیست خودروها...</span>}
            </div>

            <div className="modal-grid-2">
              <label>
                شرکت خودروساز
                <select
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                  disabled={isLoadingCars}
                >
                  {carCompanies.map((comp) => (
                    <option key={comp} value={comp}>
                      {comp}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                جستجوی سریع خودرو
                <input
                  type="text"
                  placeholder="مثلاً: ۲۰۷ یا تارا..."
                  value={carSearch}
                  onChange={(e) => setCarSearch(e.target.value)}
                  disabled={isLoadingCars}
                />
              </label>
            </div>

            <label>
              نام مدل خودرو
              <select
                value={selectedCar?.name || form.title || ""}
                onChange={(e) => handleSelectCar(e.target.value)}
                required
                disabled={isLoadingCars}
              >
                <option value="" disabled>
                  -- لطفاً خودرو موردنظر را انتخاب کنید --
                </option>
                {filteredCars.map((car) => (
                  <option key={`${car.company}-${car.name}`} value={car.name}>
                    {car.name} ({car.company}) — بازار: {car.marketPrice} تومان
                  </option>
                ))}
              </select>
            </label>

            {selectedCar && (
              <div className="car-preview-card">
                <div>
                  <div className="car-preview-title">
                    <span>{selectedCar.name}</span>
                    <span className="car-preview-company-badge">
                      {selectedCar.company}
                    </span>
                  </div>
                  {selectedCar.factoryPrice && (
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      قیمت کارخانه: {selectedCar.factoryPrice} تومان
                    </span>
                  )}
                </div>
                <div className="car-preview-price-box">
                  <span className="car-preview-price-label">قیمت بازار:</span>
                  <span className="car-preview-price-val">
                    {selectedCar.marketPrice} تومان
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <label>
              آدرس صفحهٔ محصول
              <input
                value={form.url}
                onChange={(event) => {
                  const val = event.target.value;
                  setForm((current) => {
                    let nextSource = current.source_key;
                    if (
                      val.includes("iranjib.ir") &&
                      sources.some((s) => s.key === "iranjib")
                    ) {
                      nextSource = "iranjib";
                    } else if (
                      val.includes("digikala.com") &&
                      sources.some((s) => s.key === "digikala_api")
                    ) {
                      nextSource = "digikala_api";
                    }
                    return { ...current, url: val, source_key: nextSource };
                  });
                }}
                placeholder="https://www.digikala.com/product/dkp-..."
                type="url"
                dir="ltr"
                required
                autoFocus
              />
            </label>

            {!isDigikalaUrl ? (
              <p className="product-preview-hint">
                لینک صفحهٔ محصول دیجی‌کالا را بچسبانید تا عنوان، قیمت و رنگ‌ها خودکار
                نمایش داده شوند.
              </p>
            ) : null}

            {isDigikalaUrl ? (
              isLoadingPreview ? (
                <div className="product-preview-skeleton">
                  <div className="product-preview-skeleton-image" />
                  <div className="product-preview-skeleton-lines">
                    <span />
                    <span />
                  </div>
                </div>
              ) : previewError ? (
                <div className="product-preview-hint product-preview-hint-error">
                  {previewError} می‌توانید محصول را بدون پیش‌نمایش اضافه کنید.
                </div>
              ) : preview ? (
                <div className="product-preview-card">
                  <div className="product-preview-head">
                    {preview.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="product-preview-image" src={preview.image_url} alt="" />
                    ) : null}
                    <div className="product-preview-meta">
                      <div className="product-preview-title">{preview.title}</div>
                      <div className="product-preview-price">
                        {preview.in_stock ? toman(preview.floor_price_irr) : "در حال حاضر ناموجود"}
                      </div>
                      <div className="product-preview-sub">
                        {preview.in_stock
                          ? `ارزان‌ترین پیشنهاد${preview.floor_color_label ? ` · ${preview.floor_color_label}` : ""}`
                          : "هیچ پیشنهاد موجودی برای این محصول نیست"}
                      </div>
                    </div>
                  </div>

                  <div className="product-preview-rule">
                    <span className="product-preview-rule-label">قیمت بر اساس:</span>
                    <div className="product-preview-options">
                      <button
                        type="button"
                        className={`product-preview-option ${!form.color_id ? "active" : ""}`}
                        onClick={() =>
                          setForm((current) => ({ ...current, color_id: null, color_label: null }))
                        }
                      >
                        <span className="product-preview-option-name">کف قیمت (هر رنگ)</span>
                        <span className="product-preview-option-price">
                          {preview.in_stock ? toman(preview.floor_price_irr) : "ناموجود"}
                        </span>
                      </button>

                      {(preview.colors || []).map((color) => (
                        <button
                          key={color.id}
                          type="button"
                          className={`product-preview-option ${
                            form.color_id === color.id ? "active" : ""
                          } ${color.inStock ? "" : "out-of-stock"}`}
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              color_id: color.id,
                              color_label: color.label,
                            }))
                          }
                        >
                          <span className="product-preview-option-name">
                            <span
                              className="product-preview-color-dot"
                              style={{ background: color.hex || "var(--line)" }}
                            />
                            {color.label || "بدون رنگ"}
                          </span>
                          <span className="product-preview-option-price">
                            {color.inStock ? toman(color.priceIrr) : "ناموجود"}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="product-preview-note">
                      کف قیمت بین همهٔ رنگ‌ها جابه‌جا می‌شود؛ انتخاب یک رنگ، محصول را روی
                      همان رنگ قفل می‌کند.
                    </p>
                    {(preview.colors || []).length === 1 ? (
                      <p className="product-preview-note">
                        این محصول الان فقط یک رنگ دارد؛ امروز هر دو گزینه یک قیمت می‌دهند و
                        تفاوتشان از روزی معلوم می‌شود که رنگ دیگری اضافه شود.
                      </p>
                    ) : null}
                    {(preview.colors || []).some((color) => !color.inStock) ? (
                      <p className="product-preview-note">
                        رنگ‌های ناموجود هم قابل انتخاب‌اند؛ از زمانی که موجود شوند رصد
                        می‌شوند.
                      </p>
                    ) : null}
                    <p className="product-preview-note">
                      هر گزینه یک اسلات جدا مصرف می‌کند؛ برای یک محصول فقط یکی را انتخاب
                      کن.
                    </p>
                  </div>
                </div>
              ) : null
            ) : null}

            <label>
              عنوان محصول
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="مثلاً: تلویزیون ۵۵ اینچ سامسونگ"
                autoComplete="off"
                required
              />
            </label>

            {isDigikalaUrl ? null : (
              <label>
                منبع قیمت‌گیری
                <select
                  value={form.source_key}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      source_key: event.target.value,
                    }))
                  }
                >
                  {sources.map((source) => (
                    <option key={source.key} value={source.key}>
                      {source.key} ({source.adapter})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        {isAdmin ? (
          <>
            <label className="modal-checkbox-row" style={{ marginTop: "4px" }}>
              <input
                type="checkbox"
                checked={form.is_public}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    is_public: event.target.checked,
                  }))
                }
              />
              <span>محصول عمومی بازار (قابل مشاهده برای تمام کاربران)</span>
            </label>
            <ProductActiveHoursField
              startHour={form.active_start_hour}
              endHour={form.active_end_hour}
              onChangeStart={(hour) =>
                setForm((current) => ({
                  ...current,
                  active_start_hour: hour,
                }))
              }
              onChangeEnd={(hour) =>
                setForm((current) => ({
                  ...current,
                  active_end_hour: hour,
                }))
              }
            />

            {form.is_public ? (
              <>
                <label className="modal-checkbox-row" style={{ marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={form.show_usd_chart}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        show_usd_chart: event.target.checked,
                      }))
                    }
                  />
                  <span>نمایش نمودار دلاری برای این کالا</span>
                </label>
                <label className="modal-checkbox-row" style={{ marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={form.show_gold_chart}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        show_gold_chart: event.target.checked,
                      }))
                    }
                  />
                  <span>نمایش نمودار طلای ۱۸ عیار برای این کالا</span>
                </label>
              </>
            ) : null}
          </>
        ) : null}

        <div className="modal-form-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onClose}
            disabled={isBusy}
          >
            انصراف
          </button>
          <button className="primary-button" type="submit" disabled={isBusy}>
            {isBusy ? "در حال افزودن..." : "افزودن محصول"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
