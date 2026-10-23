export interface FetchWithCookieRedirectOptions extends RequestInit {
  maxRedirects?: number;
}

/**
 * Custom fetch wrapper that manually follows HTTP redirects and preserves cookies
 * across redirects (e.g. for CDNs like DigiCDN Edge that enforce cookie challenges via 307 redirects).
 */
export async function fetchWithCookieRedirect(
  url: string,
  options: FetchWithCookieRedirectOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  let currentUrl = url;
  const headers = new Headers(options.headers);
  const cookieJar = new Map<string, string>();

  // If existing Cookie header provided, parse it into cookieJar
  const initialCookie = headers.get('Cookie');
  if (initialCookie) {
    for (const part of initialCookie.split(';')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx !== -1) {
        const k = part.slice(0, eqIdx).trim();
        const v = part.slice(eqIdx + 1).trim();
        if (k) cookieJar.set(k, v);
      }
    }
  }

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    if (cookieJar.size > 0) {
      headers.set(
        'Cookie',
        Array.from(cookieJar.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join('; ')
      );
    }

    const res = await fetch(currentUrl, {
      ...options,
      headers,
      redirect: 'manual',
    });

    // Check Set-Cookie headers
    const setCookies: string[] =
      typeof (res.headers as any).getSetCookie === 'function'
        ? (res.headers as any).getSetCookie()
        : res.headers.get('set-cookie')
          ? [res.headers.get('set-cookie')!]
          : [];

    for (const sc of setCookies) {
      if (!sc) continue;
      const cookiePart = sc.split(';')[0];
      const eqIdx = cookiePart.indexOf('=');
      if (eqIdx !== -1) {
        const k = cookiePart.slice(0, eqIdx).trim();
        const v = cookiePart.slice(eqIdx + 1).trim();
        if (k) cookieJar.set(k, v);
      }
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) {
        return res;
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return res;
  }

  throw new Error(`redirect count exceeded (${maxRedirects})`);
}
