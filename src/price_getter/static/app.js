const state = {
  products: [],
  sources: [],
  latest: [],
  history: [],
  selectedProduct: "",
};

const numberFormatter = new Intl.NumberFormat("fa-IR");
const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "short",
  timeStyle: "short",
});

function byId(id) {
  return document.getElementById(id);
}

function formatNumber(value) {
  return value === null || value === undefined ? "-" : numberFormatter.format(value);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function availabilityText(value) {
  const labels = {
    in_stock: "موجود",
    out_of_stock: "ناموجود",
    unknown: "نامشخص",
  };
  return labels[value] || value || "-";
}

function statusText(value) {
  const labels = {
    success: "موفق",
    failed: "ناموفق",
    partial: "نیمه‌کامل",
    running: "در حال اجرا",
  };
  return labels[value] || value || "-";
}

async function requestJson(url, options = {}) {
  const headers = options.body ? { "Content-Type": "application/json" } : {};
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.detail || response.statusText || "خطای ناشناخته";
    throw new Error(Array.isArray(detail) ? detail.map((item) => item.msg).join("، ") : detail);
  }
  return payload;
}

function setStatus(text) {
  byId("latestStatus").textContent = text || "";
}

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function renderTable(tbodyId, rows, cellBuilders, emptyText) {
  const tbody = byId(tbodyId);
  tbody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = cellBuilders.length;
    td.textContent = emptyText;
    td.className = "muted";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const buildCell of cellBuilders) {
      const td = document.createElement("td");
      const value = buildCell(row, td);
      if (value instanceof Node) {
        td.appendChild(value);
      } else {
        td.textContent = value;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function pill(text, className) {
  const span = document.createElement("span");
  span.className = `status-pill ${className || ""}`;
  span.textContent = text;
  return span;
}

async function loadProducts() {
  const payload = await requestJson("/api/products");
  state.products = payload.products;
  state.sources = payload.sources;
  renderProductControls();
}

function renderProductControls() {
  const productSelect = byId("productSelect");
  const historySourceSelect = byId("historySourceSelect");
  const newProductSource = byId("newProductSource");

  const previousProduct = state.selectedProduct || productSelect.value;
  productSelect.replaceChildren();
  for (const product of state.products) {
    const option = document.createElement("option");
    option.value = product.key;
    option.textContent = `${product.title} (${product.key})`;
    productSelect.appendChild(option);
  }
  const nextProduct = state.products.some((item) => item.key === previousProduct)
    ? previousProduct
    : state.products[0]?.key || "";
  productSelect.value = nextProduct;
  state.selectedProduct = nextProduct;
  productSelect.disabled = !state.products.length;
  byId("disableProductButton").disabled = !state.selectedProduct;

  historySourceSelect.replaceChildren();
  const allSources = document.createElement("option");
  allSources.value = "";
  allSources.textContent = "همه منابع";
  historySourceSelect.appendChild(allSources);
  for (const source of state.sources) {
    const option = document.createElement("option");
    option.value = source.key;
    option.textContent = `${source.key} (${source.adapter})`;
    historySourceSelect.appendChild(option);
  }

  newProductSource.replaceChildren();
  for (const source of state.sources.filter((item) => item.configured)) {
    const option = document.createElement("option");
    option.value = source.key;
    option.textContent = `${source.key} (${source.adapter})`;
    newProductSource.appendChild(option);
  }
  const defaultSource = state.sources.find((item) => item.key === "digikala_api") || state.sources[0];
  if (defaultSource) newProductSource.value = defaultSource.key;
}

async function loadLatest() {
  const payload = await requestJson("/api/latest");
  state.latest = payload.rows;
  const summary = payload.summary;
  byId("productCount").textContent = formatNumber(summary.product_count);
  byId("latestRunStatus").textContent = statusText(summary.latest_run?.status);
  byId("latestRunCounts").textContent = summary.latest_run
    ? `${formatNumber(summary.latest_run.success_count)} / ${formatNumber(summary.latest_run.error_count)}`
    : "-";
  byId("latestObservedAt").textContent = formatDate(summary.latest_observed_at);
  setStatus(`${formatNumber(payload.rows.length)} ردیف`);

  renderTable(
    "latestRows",
    payload.rows,
    [
      (row) => row.title || row.product_key,
      (row) => row.source_key,
      (row) => formatNumber(row.price_toman),
      (row) => formatNumber(row.price_irr),
      (row, td) => {
        td.className = `availability-${row.availability}`;
        return availabilityText(row.availability);
      },
      (row) => row.seller || "-",
      (row) => formatDate(row.observed_at),
    ],
    "هنوز snapshot قیمت ثبت نشده است."
  );
}

async function loadHistory() {
  const productKey = byId("productSelect").value;
  if (!productKey) {
    state.history = [];
    renderHistory([]);
    return;
  }

  state.selectedProduct = productKey;
  const params = new URLSearchParams({
    product_key: productKey,
    limit: byId("historyLimitSelect").value,
  });
  const sourceKey = byId("historySourceSelect").value;
  if (sourceKey) params.set("source_key", sourceKey);

  const payload = await requestJson(`/api/history?${params.toString()}`);
  state.history = payload.rows;
  renderHistory(payload.rows);
}

function renderHistory(rows) {
  renderChart(rows);
  renderTable(
    "historyRows",
    [...rows].reverse(),
    [
      (row) => formatDate(row.observed_at),
      (row) => row.source_key,
      (row) => formatNumber(row.price_toman),
      (row) => formatNumber(row.price_irr),
      (row, td) => {
        td.className = `availability-${row.availability}`;
        return availabilityText(row.availability);
      },
      (row) => row.seller || "-",
    ],
    "برای این محصول history ثبت نشده است."
  );
}

function renderChart(rows) {
  const canvas = byId("priceChart");
  const emptyState = byId("chartEmptyState");
  const points = rows.filter((row) => Number.isFinite(row.price_toman));
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Math.max(260, canvas.clientHeight || 338);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!points.length) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  const padding = { top: 24, right: 86, bottom: 48, left: 24 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const prices = points.map((row) => row.price_toman);
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  if (min === max) {
    min = Math.max(0, min * 0.96);
    max = max * 1.04 + 1;
  }

  ctx.direction = "rtl";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#d8dedf";
  ctx.fillStyle = "#667174";
  ctx.font = "12px Tahoma, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i += 1) {
    const ratioY = i / 4;
    const y = padding.top + chartHeight * ratioY;
    const value = max - (max - min) * ratioY;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(formatNumber(Math.round(value)), width - 12, y);
  }

  const xFor = (index) =>
    padding.left + (points.length === 1 ? chartWidth / 2 : (chartWidth * index) / (points.length - 1));
  const yFor = (price) => padding.top + chartHeight - ((price - min) / (max - min)) * chartHeight;

  ctx.strokeStyle = "#166a78";
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.price_toman);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#166a78";
  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.price_toman);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#667174";
  ctx.textAlign = "center";
  const first = points[0];
  const last = points[points.length - 1];
  ctx.fillText(formatDate(first.observed_at), xFor(0), height - 22);
  ctx.fillText(formatDate(last.observed_at), xFor(points.length - 1), height - 22);
}

async function loadRuns() {
  const payload = await requestJson("/api/runs");
  renderTable(
    "runRows",
    payload.rows,
    [
      (row) => formatNumber(row.id),
      (row) => pill(statusText(row.status), `status-${row.status}`),
      (row) => formatNumber(row.target_count),
      (row) => formatNumber(row.success_count),
      (row) => formatNumber(row.error_count),
      (row) => formatDate(row.started_at),
    ],
    "run ثبت نشده است."
  );
}

async function loadErrors() {
  const payload = await requestJson("/api/errors");
  renderTable(
    "errorRows",
    payload.rows,
    [
      (row) => row.product_key,
      (row) => row.source_key,
      (row) => row.error_type,
      (row) => row.message,
      (row) => formatDate(row.observed_at),
    ],
    "خطایی ثبت نشده است."
  );
}

async function refreshAll() {
  try {
    await loadProducts();
    await Promise.all([loadLatest(), loadHistory(), loadRuns(), loadErrors()]);
  } catch (error) {
    showToast(error.message);
  }
}

function bindEvents() {
  byId("productSelect").addEventListener("change", loadHistory);
  byId("historySourceSelect").addEventListener("change", loadHistory);
  byId("historyLimitSelect").addEventListener("change", loadHistory);
  byId("refreshHistoryButton").addEventListener("click", loadHistory);
  window.addEventListener("resize", () => renderChart(state.history));

  byId("runNowButton").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "در حال اجرا";
    try {
      const result = await requestJson("/run-now", { method: "POST" });
      showToast(`Run ${result.run_id} ${statusText(result.status)} شد.`);
      await refreshAll();
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  byId("addProductForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const payload = {
        title: byId("newProductTitle").value.trim(),
        url: byId("newProductUrl").value.trim(),
        source_key: byId("newProductSource").value || null,
      };
      const result = await requestJson("/config/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
      state.selectedProduct = result.product_key;
      byId("configStatus").textContent = `backup: ${result.backup_path}`;
      showToast(`محصول ${result.product_key} اضافه شد.`);
      await refreshAll();
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });

  byId("disableProductButton").addEventListener("click", async (event) => {
    const productKey = byId("productSelect").value;
    if (!productKey) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await requestJson(`/config/products/${encodeURIComponent(productKey)}/disable`, {
        method: "POST",
      });
      byId("configStatus").textContent = `backup: ${result.backup_path}`;
      showToast(`محصول ${result.product_key} غیرفعال شد.`);
      await refreshAll();
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  refreshAll();
});
