import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  describeError,
  formatDetailValue,
  formatLogLine,
  formatTimestamp,
  redactUrl,
} from '../src/lib/logger';
import {
  HttpRequestError,
  buildHttpFailureMessage,
  createHttpErrorFromResponse,
  httpFailureHint,
  parseRetryAfterSeconds,
  wrapFetchError,
} from '../src/lib/adapters/fetchUtils';

const FIXED_INSTANT = new Date('2026-11-14T19:09:36.000Z');

describe('logger', () => {
  let prevLogTimezone: string | undefined;

  beforeEach(() => {
    prevLogTimezone = process.env.LOG_TIMEZONE;
    process.env.LOG_TIMEZONE = 'Asia/Tehran';
  });

  afterEach(() => {
    if (prevLogTimezone === undefined) delete process.env.LOG_TIMEZONE;
    else process.env.LOG_TIMEZONE = prevLogTimezone;
  });

  it('formats timestamps with the local date, time and UTC offset', () => {
    expect(formatTimestamp(FIXED_INSTANT, 'Asia/Tehran')).toBe('2026-11-14 22:39:36 +03:30');
    expect(formatTimestamp(FIXED_INSTANT, 'UTC')).toBe('2026-11-14 19:09:36 +00:00');
  });

  it('prefixes log lines with timestamp, level and scope, then key=value details', () => {
    const line = formatLogLine(
      'warn',
      'Runner',
      'run 371: failed coin-emami/servix_market',
      { status: 429, retry_after: 60, error: 'Servix rate limit exceeded (HTTP 429)' },
      FIXED_INSTANT
    );

    expect(line).toBe(
      '[2026-11-14 22:39:36 +03:30] WARN [Runner] run 371: failed coin-emami/servix_market | ' +
        'status=429 retry_after=60 error="Servix rate limit exceeded (HTTP 429)"'
    );
  });

  it('omits empty detail values and renders nested objects compactly', () => {
    expect(
      formatLogLine('info', 'CLI', 'done', { ok: true, missing: undefined, extra: null }, FIXED_INSTANT)
    ).toBe('[2026-11-14 22:39:36 +03:30] INFO [CLI] done | ok=true');

    expect(formatDetailValue({ a: 1 })).toBe('{"a":1}');
    expect(formatDetailValue('12')).toBe('12');
  });

  it('describes HTTP errors with status, retry-after, hint and cause', () => {
    const error = new HttpRequestError('Servix', 'https://servix.cc/api/v1/assets', 429, 'Too Many Requests', {
      retryAfterSeconds: 60,
      responseExcerpt: '{"message":"too many requests"}',
      hint: httpFailureHint(429),
    });

    const details = describeError(error);

    expect(details.error_name).toBe('HttpRequestError');
    expect(details.status).toBe(429);
    expect(details.status_text).toBe('Too Many Requests');
    expect(details.retry_after).toBe(60);
    expect(details.response_excerpt).toBe('{"message":"too many requests"}');
    expect(details.hint).toContain('rate_limit_seconds');

    const timeout = new Error('Servix request timed out after 10s', { cause: new Error('aborted') });
    expect(describeError(timeout).cause).toBe('Error: aborted');
  });

  it('redacts credentials from logged URLs', () => {
    expect(redactUrl('https://api.example.com/data?symbol=USD&api_key=secret')).toBe(
      'https://api.example.com/data?symbol=USD&api_key=***'
    );
    expect(redactUrl('not a url')).toBe('not a url');
    expect(describeError(new HttpRequestError('X', 'https://x.test/?token=abc', 401, '')).url).toBe(
      'https://x.test/?token=***'
    );
  });
});

describe('HTTP failure helpers', () => {
  it('builds an explicit rate-limit message with retry-after', () => {
    expect(buildHttpFailureMessage('Servix', 429, 'Too Many Requests', { retryAfterSeconds: 60 })).toBe(
      'Servix rate limit exceeded (HTTP 429 Too Many Requests); retry after 60s'
    );
    expect(buildHttpFailureMessage('Servix', 503, '')).toBe('Servix request failed with HTTP 503');
    expect(httpFailureHint(429)).toContain('rate_limit_seconds');
    expect(httpFailureHint(401)).toContain('API key');
    expect(httpFailureHint(404)).toContain('URL');
    expect(httpFailureHint(502)).toContain('retry later');
  });

  it('parses Retry-After as seconds or as an HTTP date', () => {
    expect(parseRetryAfterSeconds('60')).toBe(60);
    expect(parseRetryAfterSeconds(' 15 ')).toBe(15);
    expect(parseRetryAfterSeconds(null)).toBeUndefined();
    expect(parseRetryAfterSeconds('not-a-date')).toBeUndefined();

    const now = Date.parse('2026-11-14T19:09:36.000Z');
    expect(parseRetryAfterSeconds('Sat, 14 Nov 2026 19:10:06 GMT', now)).toBe(30);
  });

  it('creates a rich error from a 429 response', async () => {
    const response = new Response(JSON.stringify({ message: 'too many requests' }), {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '120', 'Content-Type': 'application/json' },
    });

    const error = await createHttpErrorFromResponse('Servix', 'https://servix.cc/api/v1/assets', response);

    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(120);
    expect(error.responseExcerpt).toContain('too many requests');
    expect(error.message).toContain('Servix rate limit exceeded (HTTP 429 Too Many Requests)');
    expect(error.message).toContain('retry after 120s');
    expect(error.hint).toContain('rate_limit_seconds');
  });

  it('skips the body excerpt when readBody is false', async () => {
    const response = new Response('<html>blocked</html>', { status: 403 });
    const error = await createHttpErrorFromResponse('generic_html', 'https://example.com', response, {
      readBody: false,
    });

    expect(error.status).toBe(403);
    expect(error.responseExcerpt).toBeUndefined();
    expect(error.message).toBe('generic_html request failed with HTTP 403');
  });

  it('normalizes timeout and network failures', () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    expect(wrapFetchError('Servix', 'https://servix.cc', timeout, 10).message).toBe(
      'Servix request timed out after 10s'
    );

    expect(wrapFetchError('Servix', 'https://servix.cc', new TypeError('fetch failed')).message).toBe(
      'Servix request failed before receiving a response: fetch failed'
    );
  });
});
