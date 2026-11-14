import { formatNumber } from './formatters';

export interface CollectionSchedule {
  /** Normalized start hour (0-23, Tehran local time). */
  startHour: number;
  /** Normalized end hour (0-23, Tehran local time). */
  endHour: number;
  /** True when the product is collected around the clock (00:00 to 23:00). */
  isFullDay: boolean;
  /** Length of the collection window in hours: 24 for a full day, 12 for 08:00-20:00. */
  durationHours: number;
  /** e.g. "۲۴ ساعته" / "۱۲ ساعته" */
  durationLabel: string;
  /** e.g. "۰۰:۰۰ تا ۲۳:۰۰" */
  rangeLabel: string;
  /** e.g. "۲۴ ساعته (۰۰:۰۰ تا ۲۳:۰۰)" */
  summary: string;
}

export const FULL_DAY_START_HOUR = 0;
export const FULL_DAY_END_HOUR = 23;

/** Clamps an hour value into the valid 0-23 range and falls back when it is missing. */
export function clampScheduleHour(value: number | null | undefined, fallback: number): number {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return Math.max(0, Math.min(23, Math.trunc(Number(value))));
}

/** Formats an hour as a two-digit Persian clock label, e.g. 8 -> "۰۸". */
export function formatScheduleHour(hour: number): string {
  return formatNumber(clampScheduleHour(hour, 0)).padStart(2, '۰');
}

/**
 * Describes the collection window of a product in a way both admins and users
 * can read at a glance: whether it runs 24 hours a day, 12 hours, etc.
 */
export function describeCollectionSchedule(
  startHour?: number | null,
  endHour?: number | null
): CollectionSchedule {
  const start = clampScheduleHour(startHour, FULL_DAY_START_HOUR);
  const end = clampScheduleHour(endHour, FULL_DAY_END_HOUR);

  const isFullDay = start === FULL_DAY_START_HOUR && end === FULL_DAY_END_HOUR;
  const span = (end - start + 24) % 24;
  const durationHours = isFullDay ? 24 : start === end ? 1 : span;

  const durationLabel = `${formatNumber(durationHours)} ساعته`;
  const rangeLabel = `${formatScheduleHour(start)}:۰۰ تا ${formatScheduleHour(end)}:۰۰`;

  return {
    startHour: start,
    endHour: end,
    isFullDay,
    durationHours,
    durationLabel,
    rangeLabel,
    summary: `${durationLabel} (${rangeLabel})`,
  };
}
