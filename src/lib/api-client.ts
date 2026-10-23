export async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.detail || response.statusText || "خطای ناشناخته";
    throw new Error(Array.isArray(detail) ? detail.map((item: { msg: string }) => item.msg).join("، ") : detail);
  }
  return payload as T;
}
