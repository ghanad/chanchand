import React from "react";
import { createRoot } from "react-dom/client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./styles.css";

type Availability = "in_stock" | "out_of_stock" | "unknown" | string;
type RunStatus = "success" | "failed" | "partial" | "running" | string;

interface PriceRow {
  id: number;
  run_id: number;
  product_key: string;
  source_key: string;
  url: string;
  title: string | null;
  seller: string | null;
  price_irr: number | null;
  price_toman: number | null;
  availability: Availability;
  observed_at: string | null;
}

interface ProductRow {
  key: string;
  title: string;
  configured: boolean;
  target_count: number;
  enabled_target_count: number;
  sources: string[];
  primary_target: {
    source_key: string;
    url: string;
    enabled: boolean;
  } | null;
}

interface SourceRow {
  key: string;
  adapter: string;
  configured: boolean;
}

interface RunRow {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  status: RunStatus;
  config_path: string;
  target_count: number;
  success_count: number;
  error_count: number;
}

interface ErrorRow {
  id: number;
  run_id: number;
  product_key: string;
  source_key: string;
  url: string;
  error_type: string;
  message: string;
  observed_at: string | null;
}

interface LatestPayload {
  summary: {
    product_count: number;
    latest_run: RunRow | null;
    latest_observed_at: string | null;
  };
  rows: PriceRow[];
}

interface ProductsPayload {
  products: ProductRow[];
  sources: SourceRow[];
}

type Tab = "overview" | "prices" | "history" | "runs" | "products";

const numberFormatter = new Intl.NumberFormat("fa-IR");
const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "short",
  timeStyle: "short",
});

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "نمای کلی" },
  { id: "prices", label: "قیمت‌ها" },
  { id: "history", label: "تاریخچه" },
  { id: "runs", label: "اجرا و خطا" },
  { id: "products", label: "محصولات" },
];

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : numberFormatter.format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function productLinkUrl(row: Pick<PriceRow, "url">) {
  if (!row.url) return null;

  try {
    const url = new URL(row.url);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.hostname === "api.brsapi.ir") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function priceAxisDomain(rows: Array<{ price: number }>): [number, number] {
  const prices = rows.map((row) => row.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const spread = max - min;
  const padding = spread > 0 ? spread * 0.15 : Math.max(max * 0.05, 1);

  return [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)];
}

function availabilityText(value: Availability) {
  const labels: Record<string, string> = {
    in_stock: "موجود",
    out_of_stock: "ناموجود",
    unknown: "نامشخص",
  };
  return labels[value] || value || "-";
}

function statusText(value: RunStatus | null | undefined) {
  const labels: Record<string, string> = {
    success: "موفق",
    failed: "ناموفق",
    partial: "نیمه‌کامل",
    running: "در حال اجرا",
  };
  return value ? labels[value] || value : "-";
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.detail || response.statusText || "خطای ناشناخته";
    throw new Error(Array.isArray(detail) ? detail.map((item) => item.msg).join("، ") : detail);
  }
  return payload as T;
}

function App() {
  const [activeTab, setActiveTab] = React.useState<Tab>("overview");
  const [latest, setLatest] = React.useState<LatestPayload | null>(null);
  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [sources, setSources] = React.useState<SourceRow[]>([]);
  const [history, setHistory] = React.useState<PriceRow[]>([]);
  const [runs, setRuns] = React.useState<RunRow[]>([]);
  const [errors, setErrors] = React.useState<ErrorRow[]>([]);
  const [selectedProduct, setSelectedProduct] = React.useState("");
  const [selectedSource, setSelectedSource] = React.useState("");
  const [historyLimit, setHistoryLimit] = React.useState("200");
  const [toast, setToast] = React.useState("");
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState({ title: "", url: "", source_key: "" });
  const [editProductKey, setEditProductKey] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState({ title: "", url: "", source_key: "" });

  const showToast = React.useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(showToastTimer.current);
    showToastTimer.current = window.setTimeout(() => setToast(""), 3400);
  }, []);
  const showToastTimer = React.useRef<number>(0);

  const loadProducts = React.useCallback(async () => {
    const payload = await requestJson<ProductsPayload>("/api/products");
    setProducts(payload.products);
    setSources(payload.sources);
    setSelectedProduct((current) => {
      if (payload.products.some((product) => product.key === current)) return current;
      return payload.products[0]?.key || "";
    });
    setForm((current) => {
      if (current.source_key) return current;
      const defaultSource = payload.sources.find((source) => source.key === "digikala_api") || payload.sources[0];
      return { ...current, source_key: defaultSource?.key || "" };
    });
    return payload;
  }, []);

  const loadLatest = React.useCallback(async () => {
    setLatest(await requestJson<LatestPayload>("/api/latest"));
  }, []);

  const loadHistory = React.useCallback(async () => {
    if (!selectedProduct) {
      setHistory([]);
      return;
    }
    const params = new URLSearchParams({ product_key: selectedProduct, limit: historyLimit });
    if (selectedSource) params.set("source_key", selectedSource);
    const payload = await requestJson<{ rows: PriceRow[] }>(`/api/history?${params.toString()}`);
    setHistory(payload.rows);
  }, [historyLimit, selectedProduct, selectedSource]);

  const loadRunsAndErrors = React.useCallback(async () => {
    const [runsPayload, errorsPayload] = await Promise.all([
      requestJson<{ rows: RunRow[] }>("/api/runs"),
      requestJson<{ rows: ErrorRow[] }>("/api/errors"),
    ]);
    setRuns(runsPayload.rows);
    setErrors(errorsPayload.rows);
  }, []);

  const refreshAll = React.useCallback(async () => {
    setLoading(true);
    try {
      await loadProducts();
      await Promise.all([loadLatest(), loadRunsAndErrors()]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }, [loadLatest, loadProducts, loadRunsAndErrors, showToast]);

  React.useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  React.useEffect(() => {
    loadHistory().catch((error) => showToast(error instanceof Error ? error.message : "خطای ناشناخته"));
  }, [loadHistory, showToast]);

  const latestRun = latest?.summary.latest_run || null;
  const configuredSources = sources.filter((source) => source.configured);

  async function runNow() {
    setBusyAction("run");
    try {
      const result = await requestJson<{ run_id: number; status: RunStatus }>("/run-now", { method: "POST" });
      showToast(`Run ${numberFormatter.format(result.run_id)} ${statusText(result.status)} شد.`);
      await refreshAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطای ناشناخته");
    } finally {
      setBusyAction(null);
    }
  }

  async function addProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("add");
    try {
      const result = await requestJson<{ product_key: string; backup_path: string }>("/config/products", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          url: form.url.trim(),
          source_key: form.source_key || null,
        }),
      });
      showToast(`محصول ${result.product_key} اضافه شد.`);
      setSelectedProduct(result.product_key);
      setForm((current) => ({ title: "", url: "", source_key: current.source_key }));
      await refreshAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطای ناشناخته");
    } finally {
      setBusyAction(null);
    }
  }

  function startEditProduct(product: ProductRow) {
    if (!product.primary_target) return;
    setEditProductKey(product.key);
    setEditForm({
      title: product.title,
      url: product.primary_target.url,
      source_key: product.primary_target.source_key,
    });
  }

  function cancelEditProduct() {
    setEditProductKey(null);
    setEditForm({ title: "", url: "", source_key: "" });
  }

  async function updateProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editProductKey) return;
    setBusyAction(`edit:${editProductKey}`);
    try {
      const result = await requestJson<{ product_key: string; backup_path: string }>(
        `/config/products/${encodeURIComponent(editProductKey)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            title: editForm.title.trim(),
            url: editForm.url.trim(),
            source_key: editForm.source_key || null,
          }),
        },
      );
      showToast(`محصول ${result.product_key} ویرایش شد.`);
      cancelEditProduct();
      await refreshAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطای ناشناخته");
    } finally {
      setBusyAction(null);
    }
  }

  async function disableProduct(productKey: string) {
    if (!productKey) return;
    setBusyAction(`disable:${productKey}`);
    try {
      const result = await requestJson<{ product_key: string }>(
        `/config/products/${encodeURIComponent(productKey)}/disable`,
        { method: "POST" },
      );
      showToast(`محصول ${result.product_key} غیرفعال شد.`);
      await refreshAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطای ناشناخته");
    } finally {
      setBusyAction(null);
    }
  }

  async function enableProduct(productKey: string) {
    if (!productKey) return;
    setBusyAction(`enable:${productKey}`);
    try {
      const result = await requestJson<{ product_key: string }>(
        `/config/products/${encodeURIComponent(productKey)}/enable`,
        { method: "POST" },
      );
      showToast(`محصول ${result.product_key} فعال شد.`);
      await refreshAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطای ناشناخته");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteProduct(product: ProductRow) {
    if (!product.key) return;
    const confirmed = window.confirm(`محصول «${product.title}» از config حذف شود؟`);
    if (!confirmed) return;

    setBusyAction(`delete:${product.key}`);
    try {
      const result = await requestJson<{ product_key: string }>(
        `/config/products/${encodeURIComponent(product.key)}`,
        { method: "DELETE" },
      );
      showToast(`محصول ${result.product_key} حذف شد.`);
      if (selectedProduct === product.key) {
        setSelectedProduct("");
      }
      if (editProductKey === product.key) {
        cancelEditProduct();
      }
      await refreshAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطای ناشناخته");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark">PG</span>
          <div>
            <p>داشبورد محلی</p>
            <h1>Price Getter</h1>
          </div>
        </div>
        <nav className="nav-list" aria-label="بخش‌های داشبورد">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">SQLite price intelligence</p>
            <h2>{tabs.find((tab) => tab.id === activeTab)?.label}</h2>
          </div>
          <div className="header-actions">
            <button className="secondary-button" type="button" onClick={refreshAll} disabled={loading}>
              تازه‌سازی
            </button>
            <button className="primary-button" type="button" onClick={runNow} disabled={busyAction === "run"}>
              {busyAction === "run" ? "در حال اجرا" : "اجرای جمع‌آوری"}
            </button>
          </div>
        </header>

        {activeTab === "overview" && (
          <Overview latest={latest} rows={latest?.rows || []} runs={runs} errors={errors} />
        )}
        {activeTab === "prices" && <Prices rows={latest?.rows || []} />}
        {activeTab === "history" && (
          <History
            history={history}
            products={products}
            sources={sources}
            selectedProduct={selectedProduct}
            selectedSource={selectedSource}
            historyLimit={historyLimit}
            setSelectedProduct={setSelectedProduct}
            setSelectedSource={setSelectedSource}
            setHistoryLimit={setHistoryLimit}
          />
        )}
        {activeTab === "runs" && <RunsAndErrors runs={runs} errors={errors} />}
        {activeTab === "products" && (
          <Products
            products={products}
            configuredSources={configuredSources}
            form={form}
            setForm={setForm}
            editProductKey={editProductKey}
            editForm={editForm}
            setEditForm={setEditForm}
            addProduct={addProduct}
            updateProduct={updateProduct}
            startEditProduct={startEditProduct}
            cancelEditProduct={cancelEditProduct}
            disableProduct={disableProduct}
            enableProduct={enableProduct}
            deleteProduct={deleteProduct}
            busyAction={busyAction}
          />
        )}

        <footer className="status-strip">
          <span>{loading ? "در حال دریافت داده‌ها" : "آماده"}</span>
          <span>آخرین run: {statusText(latestRun?.status)}</span>
          <span>آخرین مشاهده: {formatDate(latest?.summary.latest_observed_at)}</span>
        </footer>
      </section>

      <div className={`toast ${toast ? "visible" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </main>
  );
}

function Overview({
  latest,
  rows,
  runs,
  errors,
}: {
  latest: LatestPayload | null;
  rows: PriceRow[];
  runs: RunRow[];
  errors: ErrorRow[];
}) {
  const latestRun = latest?.summary.latest_run || null;
  return (
    <div className="page-stack">
      <section className="metric-grid" aria-label="خلاصه">
        <Metric label="محصول‌ها" value={formatNumber(latest?.summary.product_count)} />
        <Metric label="آخرین run" value={statusText(latestRun?.status)} tone={latestRun?.status} />
        <Metric
          label="موفق / خطا"
          value={latestRun ? `${formatNumber(latestRun.success_count)} / ${formatNumber(latestRun.error_count)}` : "-"}
        />
        <Metric label="آخرین مشاهده" value={formatDate(latest?.summary.latest_observed_at)} />
      </section>

      <section className="overview-grid">
        <div className="panel">
          <PanelHead title="آخرین قیمت‌ها" meta={`${formatNumber(rows.length)} ردیف`} />
          <PriceTable rows={rows.slice(0, 8)} compact />
        </div>
        <div className="panel">
          <PanelHead title="وضعیت عملیات" meta={`${formatNumber(runs.length)} run`} />
          <RunTable rows={runs.slice(0, 6)} compact />
        </div>
      </section>

      <section className="panel">
        <PanelHead title="خطاهای اخیر" meta={`${formatNumber(errors.length)} خطا`} />
        <ErrorTable rows={errors.slice(0, 6)} />
      </section>
    </div>
  );
}

function Prices({ rows }: { rows: PriceRow[] }) {
  return (
    <section className="panel">
      <PanelHead title="آخرین snapshot قیمت‌ها" meta={`${formatNumber(rows.length)} ردیف`} />
      <PriceTable rows={rows} />
    </section>
  );
}

function History({
  history,
  products,
  sources,
  selectedProduct,
  selectedSource,
  historyLimit,
  setSelectedProduct,
  setSelectedSource,
  setHistoryLimit,
}: {
  history: PriceRow[];
  products: ProductRow[];
  sources: SourceRow[];
  selectedProduct: string;
  selectedSource: string;
  historyLimit: string;
  setSelectedProduct: (value: string) => void;
  setSelectedSource: (value: string) => void;
  setHistoryLimit: (value: string) => void;
}) {
  const chartRows = history.flatMap((row) => {
    if (!Number.isFinite(row.price_toman)) return [];

    return [{
      time: formatDate(row.observed_at),
      source: row.source_key,
      price: Number(row.price_toman),
    }];
  });
  const chartPriceDomain = chartRows.length ? priceAxisDomain(chartRows) : undefined;

  return (
    <div className="page-stack">
      <section className="panel">
        <PanelHead title="فیلتر تاریخچه" meta={`${formatNumber(history.length)} مشاهده`} />
        <div className="toolbar">
          <label>
            محصول
            <select value={selectedProduct} onChange={(event) => setSelectedProduct(event.target.value)}>
              {products.map((product) => (
                <option key={product.key} value={product.key}>
                  {product.title} ({product.key})
                </option>
              ))}
            </select>
          </label>
          <label>
            منبع
            <select value={selectedSource} onChange={(event) => setSelectedSource(event.target.value)}>
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
            <select value={historyLimit} onChange={(event) => setHistoryLimit(event.target.value)}>
              <option value="50">۵۰</option>
              <option value="100">۱۰۰</option>
              <option value="200">۲۰۰</option>
              <option value="500">۵۰۰</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel chart-panel">
        <PanelHead title="روند قیمت" meta="تومان" />
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
                formatter={(value) => [`${numberFormatter.format(Number(value))} تومان`, "قیمت"]}
                labelFormatter={(value) => `زمان: ${value}`}
              />
              <Area type="monotone" dataKey="price" stroke="#0f766e" strokeWidth={3} fill="url(#priceFill)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="داده‌ای برای نمودار نیست." />
        )}
      </section>

      <section className="panel">
        <PanelHead title="مشاهدات تاریخچه" />
        <HistoryTable rows={[...history].reverse()} />
      </section>
    </div>
  );
}

function RunsAndErrors({ runs, errors }: { runs: RunRow[]; errors: ErrorRow[] }) {
  return (
    <div className="page-stack">
      <section className="panel">
        <PanelHead title="Runهای اخیر" meta={`${formatNumber(runs.length)} run`} />
        <RunTable rows={runs} />
      </section>
      <section className="panel">
        <PanelHead title="خطاهای اخیر" meta={`${formatNumber(errors.length)} خطا`} />
        <ErrorTable rows={errors} />
      </section>
    </div>
  );
}

function Products({
  products,
  configuredSources,
  form,
  setForm,
  editProductKey,
  editForm,
  setEditForm,
  addProduct,
  updateProduct,
  startEditProduct,
  cancelEditProduct,
  disableProduct,
  enableProduct,
  deleteProduct,
  busyAction,
}: {
  products: ProductRow[];
  configuredSources: SourceRow[];
  form: { title: string; url: string; source_key: string };
  setForm: React.Dispatch<React.SetStateAction<{ title: string; url: string; source_key: string }>>;
  editProductKey: string | null;
  editForm: { title: string; url: string; source_key: string };
  setEditForm: React.Dispatch<React.SetStateAction<{ title: string; url: string; source_key: string }>>;
  addProduct: (event: React.FormEvent<HTMLFormElement>) => void;
  updateProduct: (event: React.FormEvent<HTMLFormElement>) => void;
  startEditProduct: (product: ProductRow) => void;
  cancelEditProduct: () => void;
  disableProduct: (productKey: string) => void;
  enableProduct: (productKey: string) => void;
  deleteProduct: (product: ProductRow) => void;
  busyAction: string | null;
}) {
  const activeTargetCount = products.reduce((total, product) => total + product.enabled_target_count, 0);
  const targetCount = products.reduce((total, product) => total + product.target_count, 0);
  const activeProducts = products.filter((product) => product.enabled_target_count > 0).length;
  const configProducts = products.filter((product) => product.configured);
  const configuredProductCount = configProducts.length;

  return (
    <div className="products-page">
      <section className="product-summary-grid" aria-label="خلاصه محصولات">
        <Metric label="کل محصول‌ها" value={formatNumber(configuredProductCount)} />
        <Metric label="محصول فعال" value={formatNumber(activeProducts)} />
        <Metric label="هدف‌های فعال" value={`${formatNumber(activeTargetCount)} / ${formatNumber(targetCount)}`} />
        <Metric label="منبع‌های config" value={formatNumber(configuredSources.length)} />
      </section>

      <div className="product-grid">
        <section className="panel product-form-panel">
          <PanelHead title="افزودن محصول" />
          <form className="product-form" onSubmit={addProduct}>
            <label>
              عنوان
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                autoComplete="off"
                required
              />
            </label>
            <label>
              URL
              <input
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                type="url"
                required
              />
            </label>
            <label>
              منبع
              <select
                value={form.source_key}
                onChange={(event) => setForm((current) => ({ ...current, source_key: event.target.value }))}
              >
                {configuredSources.map((source) => (
                  <option key={source.key} value={source.key}>
                    {source.key} ({source.adapter})
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button product-submit" type="submit" disabled={busyAction === "add"}>
              {busyAction === "add" ? "در حال افزودن" : "اضافه کردن"}
            </button>
          </form>
        </section>
        <section className="panel product-list-panel">
          <PanelHead title="محصول‌های config" meta={`${formatNumber(configuredProductCount)} محصول`} />
          <div className="product-list">
            {configProducts.map((product) => {
              const isActive = product.enabled_target_count > 0;
              const canToggle = product.target_count > 0;
              const actionBusy = busyAction === `disable:${product.key}` || busyAction === `enable:${product.key}`;
              const editBusy = busyAction === `edit:${product.key}`;
              const deleteBusy = busyAction === `delete:${product.key}`;
              const canDelete = product.configured && configuredProductCount > 1;
              const isEditing = editProductKey === product.key;
              const status = product.target_count === 0 ? "بدون هدف" : isActive ? "فعال" : "غیرفعال";
              const statusTone = isActive ? "in_stock" : product.target_count === 0 ? "unknown" : "out_of_stock";
              return (
                <article className="product-row" key={product.key}>
                  {isEditing ? (
                    <form className="product-edit-form" onSubmit={updateProduct}>
                      <label>
                        عنوان
                        <input
                          value={editForm.title}
                          onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                          autoComplete="off"
                          required
                        />
                      </label>
                      <label>
                        URL
                        <input
                          value={editForm.url}
                          onChange={(event) => setEditForm((current) => ({ ...current, url: event.target.value }))}
                          type="url"
                          required
                        />
                      </label>
                      <label>
                        منبع
                        <select
                          value={editForm.source_key}
                          onChange={(event) => setEditForm((current) => ({ ...current, source_key: event.target.value }))}
                        >
                          {configuredSources.map((source) => (
                            <option key={source.key} value={source.key}>
                              {source.key} ({source.adapter})
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="product-edit-actions">
                        <button className="primary-button" type="submit" disabled={editBusy}>
                          {editBusy ? "در حال ذخیره" : "ذخیره"}
                        </button>
                        <button className="secondary-button" type="button" onClick={cancelEditProduct} disabled={editBusy}>
                          انصراف
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="product-main">
                        <div className="product-title-row">
                          <strong>{product.title}</strong>
                          <StatusPill text={status} tone={statusTone} />
                        </div>
                        <span className="product-key">{product.key}</span>
                        {product.primary_target ? <span className="product-url">{product.primary_target.url}</span> : null}
                        <div className="source-chip-row">
                          {product.sources.length ? (
                            product.sources.map((source) => (
                              <span className="source-chip" key={`${product.key}:${source}`}>
                                {source}
                              </span>
                            ))
                          ) : (
                            <span className="source-chip muted-chip">بدون منبع</span>
                          )}
                        </div>
                      </div>
                      <div className="product-meta">
                        <span>{formatNumber(product.enabled_target_count)} / {formatNumber(product.target_count)} هدف فعال</span>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => startEditProduct(product)}
                          disabled={!product.primary_target || busyAction !== null}
                        >
                          ویرایش
                        </button>
                        <button
                          className={isActive ? "danger-button" : "secondary-button"}
                          type="button"
                          onClick={() => (isActive ? disableProduct(product.key) : enableProduct(product.key))}
                          disabled={!canToggle || actionBusy || busyAction === `delete:${product.key}`}
                        >
                          {actionBusy
                            ? isActive ? "در حال غیرفعال‌سازی" : "در حال فعال‌سازی"
                            : isActive ? "غیرفعال کردن" : canToggle ? "فعال کردن" : "بدون هدف"}
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => deleteProduct(product)}
                          disabled={!canDelete || deleteBusy || busyAction !== null}
                        >
                          {deleteBusy ? "در حال حذف" : "حذف"}
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: RunStatus | null }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong className={tone ? `tone-${tone}` : ""}>{value}</strong>
    </article>
  );
}

function PanelHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="panel-head">
      <h3>{title}</h3>
      {meta ? <span>{meta}</span> : null}
    </div>
  );
}

function PriceTable({ rows, compact = false }: { rows: PriceRow[]; compact?: boolean }) {
  return (
    <DataTable emptyText="هنوز snapshot قیمت ثبت نشده است." compact={compact}>
      <thead>
        <tr>
          <th>محصول</th>
          <th>منبع</th>
          <th>قیمت تومان</th>
          <th>وضعیت</th>
          <th>فروشنده</th>
          <th>زمان</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.title || row.product_key}</td>
            <td>{row.source_key}</td>
            <td>{formatNumber(row.price_toman)}</td>
            <td><StatusPill text={availabilityText(row.availability)} tone={row.availability} /></td>
            <td>{row.seller || "-"}</td>
            <td>{formatDate(row.observed_at)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function HistoryTable({ rows }: { rows: PriceRow[] }) {
  return (
    <DataTable emptyText="برای این محصول history ثبت نشده است.">
      <thead>
        <tr>
          <th>زمان</th>
          <th>منبع</th>
          <th>لینک</th>
          <th>تومان</th>
          <th>IRR</th>
          <th>وضعیت</th>
          <th>فروشنده</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const url = productLinkUrl(row);

          return (
            <tr key={row.id}>
              <td>{formatDate(row.observed_at)}</td>
              <td>{row.source_key}</td>
              <td>
                {url ? (
                  <a className="table-link" href={url} target="_blank" rel="noreferrer">
                    باز کردن
                  </a>
                ) : (
                  <span className="muted-cell">-</span>
                )}
              </td>
              <td>{formatNumber(row.price_toman)}</td>
              <td>{formatNumber(row.price_irr)}</td>
              <td><StatusPill text={availabilityText(row.availability)} tone={row.availability} /></td>
              <td>{row.seller || "-"}</td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

function RunTable({ rows, compact = false }: { rows: RunRow[]; compact?: boolean }) {
  return (
    <DataTable emptyText="run ثبت نشده است." compact={compact}>
      <thead>
        <tr>
          <th>ID</th>
          <th>وضعیت</th>
          <th>هدف</th>
          <th>موفق</th>
          <th>خطا</th>
          <th>شروع</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{formatNumber(row.id)}</td>
            <td><StatusPill text={statusText(row.status)} tone={row.status} /></td>
            <td>{formatNumber(row.target_count)}</td>
            <td>{formatNumber(row.success_count)}</td>
            <td>{formatNumber(row.error_count)}</td>
            <td>{formatDate(row.started_at)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function ErrorTable({ rows }: { rows: ErrorRow[] }) {
  return (
    <DataTable emptyText="خطایی ثبت نشده است.">
      <thead>
        <tr>
          <th>محصول</th>
          <th>منبع</th>
          <th>نوع</th>
          <th>پیام</th>
          <th>زمان</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.product_key}</td>
            <td>{row.source_key}</td>
            <td>{row.error_type}</td>
            <td className="message-cell">{row.message}</td>
            <td>{formatDate(row.observed_at)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function DataTable({
  children,
  emptyText,
  compact,
}: {
  children: React.ReactNode;
  emptyText: string;
  compact?: boolean;
}) {
  const body = React.Children.toArray(children).find(
    (child) => React.isValidElement(child) && child.type === "tbody",
  ) as React.ReactElement<{ children?: React.ReactNode }> | undefined;
  const hasRows = body ? React.Children.count(body.props.children) > 0 : true;

  return (
    <div className={`table-wrap ${compact ? "compact" : ""}`}>
      <table>{children}</table>
      {!hasRows ? <EmptyState text={emptyText} /> : null}
    </div>
  );
}

function StatusPill({ text, tone }: { text: string; tone: string }) {
  return <span className={`status-pill tone-${tone}`}>{text}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
