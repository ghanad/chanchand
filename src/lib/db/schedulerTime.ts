export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Tehran';
}

export function getTimezoneHour(date: Date = new Date(), timeZone: string = getAppTimezone()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');
    return hourPart ? parseInt(hourPart.value, 10) : date.getHours();
  } catch {
    return date.getHours();
  }
}

export function getHourBounds(
  date: Date = new Date(),
  timeZone: string = getAppTimezone()
): { startOfHour: string; endOfHour: string; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);

    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
    }

    const minute = p.minute ?? date.getMinutes();
    const second = p.second ?? date.getSeconds();
    const ms = date.getMilliseconds();
    const msIntoHour = (minute * 60 + second) * 1000 + ms;
    const startOfHour = new Date(date.getTime() - msIntoHour);
    const endOfHour = new Date(startOfHour.getTime() + 60 * 60 * 1000 - 1);

    return {
      hour: p.hour ?? date.getHours(),
      startOfHour: startOfHour.toISOString(),
      endOfHour: endOfHour.toISOString(),
    };
  } catch {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), 0, 0, 0);
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), 59, 59, 999);
    return {
      hour: date.getHours(),
      startOfHour: start.toISOString(),
      endOfHour: end.toISOString(),
    };
  }
}

export function getDayBounds(
  date: Date = new Date(),
  timeZone: string = getAppTimezone()
): { startOfDay: string; endOfDay: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);

    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
    }

    const hour = p.hour ?? date.getHours();
    const minute = p.minute ?? date.getMinutes();
    const second = p.second ?? date.getSeconds();
    const ms = date.getMilliseconds();
    const msIntoDay = ((hour * 60 + minute) * 60 + second) * 1000 + ms;
    const startOfDay = new Date(date.getTime() - msIntoDay);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

    return {
      startOfDay: startOfDay.toISOString(),
      endOfDay: endOfDay.toISOString(),
    };
  } catch {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).toISOString();
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).toISOString();
    return { startOfDay, endOfDay };
  }
}

export function isHourInWindow(currentHour: number, startHour: number = 8, endHour: number = 23): boolean {
  if (startHour <= endHour) {
    return currentHour >= startHour && currentHour <= endHour;
  }
  // Overnight window: e.g. 22:00 to 06:00
  return currentHour >= startHour || currentHour <= endHour;
}
