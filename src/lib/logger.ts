import { getAppTimezone } from './db/schedulerTime';

/**
 * Minimal structured logger for CLI output and server-side run logs.
 *
 * Every line carries a local timestamp with UTC offset, the level and a scope,
 * followed by optional `key=value` details, e.g.:
 *
 * [2026-11-14 22:39:36 +03:30] WARN [Runner] run 371: failed coin-emami/servix_market | status=429 retry_after=60
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogDetails = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MAX_DETAIL_LENGTH = 500;

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

function getMinLevel(): LogLevel {
  const raw = String(process.env.LOG_LEVEL || '')
    .trim()
    .toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

/**
 * Removes credentials from a URL before it is logged, e.g. `?api_key=...` -> `?api_key=***`.
 * Target URLs sometimes carry provider keys in the query string.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let changed = false;
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (!/key|token|secret|password|pass|auth|signature|sig/i.test(key)) continue;
      parsed.searchParams.set(key, '***');
      changed = true;
    }
    return changed ? parsed.toString() : url;
  } catch {
    return url;
  }
}

export function getLogTimezone(): string {
  return process.env.LOG_TIMEZONE || getAppTimezone();
}

function formatOffset(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(date);
    const name = parts.find((part) => part.type === 'timeZoneName')?.value || '';
    if (name === 'GMT' || name === 'UTC') return '+00:00';
    const match = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    if (match) return `${match[1]}${match[2]}:${match[3] ?? '00'}`;
  } catch {
    // Fall through to the host offset below.
  }
  const totalMinutes = -date.getTimezoneOffset();
  const sign = totalMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(totalMinutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const timestampFormatters = new Map<string, Intl.DateTimeFormat>();

function getTimestampFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = timestampFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    timestampFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Local wall-clock timestamp with UTC offset, e.g. `2026-11-14 22:39:36 +03:30`. */
export function formatTimestamp(date: Date = new Date(), timeZone: string = getLogTimezone()): string {
  try {
    const parts = getTimestampFormatter(timeZone).formatToParts(date);

    const p: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') p[part.type] = part.value;
    }

    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${formatOffset(date, timeZone)}`;
  } catch {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${formatOffset(date, getLogTimezone())}`;
  }
}

function truncate(value: string, max = MAX_DETAIL_LENGTH): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/** Renders one detail value so log lines stay greppable and unambiguous. */
export function formatDetailValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '""';
    const text = truncate(trimmed);
    return /[\s=|"]/.test(text) ? JSON.stringify(text) : text;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    const cause = (value as Error & { cause?: unknown }).cause;
    const causeText =
      cause === undefined || cause === null
        ? ''
        : ` (cause: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)})`;
    return formatDetailValue(`${value.name}: ${value.message}${causeText}`);
  }

  try {
    return truncate(JSON.stringify(value));
  } catch {
    return truncate(String(value));
  }
}

export function formatLogLine(
  level: LogLevel,
  scope: string,
  message: string,
  details?: LogDetails,
  date: Date = new Date()
): string {
  const segments: string[] = [];
  if (details) {
    for (const [key, value] of Object.entries(details)) {
      const formatted = formatDetailValue(value);
      if (formatted !== null) segments.push(`${key}=${formatted}`);
    }
  }
  const suffix = segments.length > 0 ? ` | ${segments.join(' ')}` : '';
  return `[${formatTimestamp(date)}] ${level.toUpperCase()} [${scope}] ${message}${suffix}`;
}

const ERROR_DETAIL_KEYS: Array<[string, string]> = [
  ['status', 'status'],
  ['statusCode', 'status'],
  ['status_code', 'status'],
  ['statusText', 'status_text'],
  ['code', 'code'],
  ['provider', 'provider'],
  ['url', 'url'],
  ['retryAfterSeconds', 'retry_after'],
  ['retry_after_seconds', 'retry_after'],
  ['responseExcerpt', 'response_excerpt'],
  ['hint', 'hint'],
];

/** Extracts the useful parts of an error (message, HTTP status, hint, cause) for log details. */
export function describeError(error: unknown): LogDetails {
  if (error === undefined || error === null) return {};
  if (!(error instanceof Error)) {
    return { error: String(error) };
  }

  const err = error as Error & Record<string, unknown>;
  const details: LogDetails = {
    error_name: err.name || 'Error',
    error: err.message || String(error),
  };

  for (const [prop, label] of ERROR_DETAIL_KEYS) {
    const value = err[prop];
    if (value === undefined || value === null) continue;
    if (details[label] !== undefined) continue;
    details[label] = typeof value === 'string' && label === 'url' ? redactUrl(value) : value;
  }

  if (err.cause !== undefined && err.cause !== null) {
    details.cause =
      err.cause instanceof Error ? `${err.cause.name}: ${err.cause.message}` : String(err.cause);
  }

  return details;
}

export function log(level: LogLevel, scope: string, message: string, details?: LogDetails): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[getMinLevel()]) return;

  const line = formatLogLine(level, scope, message, details);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logDebug(scope: string, message: string, details?: LogDetails): void {
  log('debug', scope, message, details);
}

export function logInfo(scope: string, message: string, details?: LogDetails): void {
  log('info', scope, message, details);
}

export function logWarn(scope: string, message: string, details?: LogDetails): void {
  log('warn', scope, message, details);
}

export function logError(scope: string, message: string, details?: LogDetails): void {
  log('error', scope, message, details);
}
