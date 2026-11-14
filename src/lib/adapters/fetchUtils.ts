export interface FetchWithCookieRedirectOptions extends RequestInit {
  maxRedirects?: number;
}

export interface HttpFailureOptions {
  /** Value of the `Retry-After` response header, in seconds. */
  retryAfterSeconds?: number;
  /** Short excerpt of the response body (helps explain HTML/JSON error payloads). */
  responseExcerpt?: string;
  /** Actionable hint for the operator, e.g. "raise rate_limit_seconds". */
  hint?: string;
}

/**
 * Error thrown when an upstream API answers with a non-2xx status.
 * Carries the HTTP status, `Retry-After` and a short body excerpt so the runner
 * and `fetch_errors` can explain *why* a target failed instead of just "request failed".
 */
export class HttpRequestError extends Error {
  readonly provider: string;
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly retryAfterSeconds?: number;
  readonly responseExcerpt?: string;
  readonly hint?: string;

  constructor(
    provider: string,
    url: string,
    status: number,
    statusText: string,
    options: HttpFailureOptions = {}
  ) {
    super(buildHttpFailureMessage(provider, status, statusText, options));
    this.name = 'HttpRequestError';
    this.provider = provider;
    this.url = url;
    this.status = status;
    this.statusText = statusText;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.responseExcerpt = options.responseExcerpt;
    this.hint = options.hint;
  }
}

/** Human-readable explanation for the most common upstream failures. */
export function httpFailureHint(status: number): string {
  if (status === 429) {
    return 'source is throttling requests; raise rate_limit_seconds for this source or retry later';
  }
  if (status === 401 || status === 403) {
    return 'check the source API key / credentials and request headers';
  }
  if (status === 404) {
    return 'check the target URL (the endpoint may have moved)';
  }
  if (status >= 500) {
    return 'upstream source error; retry later';
  }
  return 'source rejected the request; check the URL, headers and adapter settings';
}

export function buildHttpFailureMessage(
  provider: string,
  status: number,
  statusText: string,
  options: HttpFailureOptions = {}
): string {
  const statusLabel = `HTTP ${status}${statusText ? ` ${statusText}` : ''}`;
  const base =
    status === 429
      ? `${provider} rate limit exceeded (${statusLabel})`
      : `${provider} request failed with ${statusLabel}`;

  if (options.retryAfterSeconds === undefined) return base;
  return `${base}; retry after ${options.retryAfterSeconds}s`;
}

/** Parses `Retry-After` (delta seconds or an HTTP date) into seconds from now. */
export function parseRetryAfterSeconds(
  value: string | null | undefined,
  now: number = Date.now()
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? Math.max(0, seconds) : undefined;
  }

  const target = Date.parse(trimmed);
  if (Number.isNaN(target)) return undefined;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

/** Normalizes network/timeout failures so logs say what happened (timeout vs. unreachable host). */
export function wrapFetchError(
  provider: string,
  url: string,
  error: unknown,
  timeoutSeconds?: number
): Error {
  if (error instanceof HttpRequestError) return error;

  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    const timeout = timeoutSeconds ? ` after ${timeoutSeconds}s` : '';
    return new Error(`${provider} request timed out${timeout}`, { cause: error });
  }

  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`${provider} request failed before receiving a response: ${reason}`, {
    cause: error instanceof Error ? error : undefined,
  });
}

/** Builds a rich error from a failed `fetch` response, reading a short body excerpt when possible. */
export async function createHttpErrorFromResponse(
  provider: string,
  url: string,
  response: Response,
  options: { maxExcerpt?: number; readBody?: boolean } = {}
): Promise<HttpRequestError> {
  const maxExcerpt = options.maxExcerpt ?? 300;
  let responseExcerpt: string | undefined;

  if (options.readBody !== false) {
    try {
      const text = await response.text();
      const compact = text.replace(/\s+/g, ' ').trim();
      if (compact) responseExcerpt = compact.slice(0, maxExcerpt);
    } catch {
      // Body is optional; ignore unreadable payloads.
    }
  }

  return new HttpRequestError(provider, url, response.status, response.statusText, {
    retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after')),
    responseExcerpt,
    hint: httpFailureHint(response.status),
  });
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
