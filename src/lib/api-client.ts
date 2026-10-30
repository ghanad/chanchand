export async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    let detail = payload.error || payload.detail || payload.message;
    if (!detail) {
      if (response.status === 401) {
        detail = "نام کاربری یا کلمه عبور نادرست است.";
      } else if (response.status === 403) {
        detail = "شما اجازه دسترسی به این بخش را ندارید.";
      } else if (response.status === 404) {
        detail = "اطلاعات مورد نظر یافت نشد.";
      } else if (response.status === 429) {
        detail = "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند دقیقه بعد مجدداً تلاش کنید.";
      } else {
        detail = response.statusText || "خطایی در برقراری ارتباط با سرور رخ داده است.";
      }
    }
    throw new Error(Array.isArray(detail) ? detail.map((item: { msg: string }) => item.msg).join("، ") : detail);
  }
  return payload as T;
}
