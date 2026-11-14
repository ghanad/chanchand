import { describe, it, expect } from 'vitest';
import { describeCollectionSchedule, formatScheduleHour } from '../src/lib/schedule';

describe('collection schedule labels', () => {
  it('labels full-day collection as a 24-hour window', () => {
    const schedule = describeCollectionSchedule(0, 23);
    expect(schedule.isFullDay).toBe(true);
    expect(schedule.durationHours).toBe(24);
    expect(schedule.durationLabel).toBe('۲۴ ساعته');
    expect(schedule.rangeLabel).toBe('۰۰:۰۰ تا ۲۳:۰۰');
    expect(schedule.summary).toBe('۲۴ ساعته (۰۰:۰۰ تا ۲۳:۰۰)');
  });

  it('labels an 08:00-20:00 window as 12 hours', () => {
    const schedule = describeCollectionSchedule(8, 20);
    expect(schedule.isFullDay).toBe(false);
    expect(schedule.durationHours).toBe(12);
    expect(schedule.durationLabel).toBe('۱۲ ساعته');
    expect(schedule.summary).toBe('۱۲ ساعته (۰۸:۰۰ تا ۲۰:۰۰)');
  });

  it('labels the default 08:00-23:00 window as 15 hours', () => {
    const schedule = describeCollectionSchedule(8, 23);
    expect(schedule.isFullDay).toBe(false);
    expect(schedule.durationHours).toBe(15);
    expect(schedule.durationLabel).toBe('۱۵ ساعته');
  });

  it('counts overnight windows across midnight', () => {
    const schedule = describeCollectionSchedule(22, 6);
    expect(schedule.isFullDay).toBe(false);
    expect(schedule.durationHours).toBe(8);
    expect(schedule.summary).toBe('۸ ساعته (۲۲:۰۰ تا ۰۶:۰۰)');
  });

  it('falls back to a 24-hour window when hours are missing', () => {
    expect(describeCollectionSchedule(undefined, undefined).isFullDay).toBe(true);
    expect(describeCollectionSchedule(null, null).durationLabel).toBe('۲۴ ساعته');
  });

  it('clamps out-of-range hours', () => {
    const schedule = describeCollectionSchedule(-5, 30);
    expect(schedule.startHour).toBe(0);
    expect(schedule.endHour).toBe(23);
    expect(schedule.isFullDay).toBe(true);
  });

  it('formats hours as two-digit Persian clock labels', () => {
    expect(formatScheduleHour(0)).toBe('۰۰');
    expect(formatScheduleHour(8)).toBe('۰۸');
    expect(formatScheduleHour(23)).toBe('۲۳');
  });
});
