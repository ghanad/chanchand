import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "../../common/Modal";
import { ProductActiveHoursField } from "./ProductActiveHoursField";
import { SourceRow } from "../../../types/dashboard";
import { ProductFormState } from "./types";
import { requestJson } from "@/lib/api-client";

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
  const hasIranjibSource = useMemo(() => sources.some((s) => s.key === "iranjib"), [sources]);

  const [mode, setMode] = useState<"general" | "car">("general");
  const [carItems, setCarItems] = useState<IranjibItemData[]>([]);
  const [carCompanies, setCarCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("همه");
  const [carSearch, setCarSearch] = useState<string>("");
  const [selectedCar, setSelectedCar] = useState<IranjibItemData | null>(null);
  const [isLoadingCars, setIsLoadingCars] = useState<boolean>(false);
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
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="افزودن محصول جدید">
      {hasIranjibSource && (
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
      )}

      <form className="modal-form" onSubmit={onSubmit}>
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
              عنوان محصول
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="مثلاً: تلویزیون ۵۵ اینچ سامسونگ"
                autoComplete="off"
                required
                autoFocus
              />
            </label>
            <label>
              آدرس اینترنتی (URL)
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
                placeholder="https://..."
                type="url"
                dir="ltr"
                required
              />
            </label>
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
            {form.is_public ? (
              <>
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
