/** Local-calendar day helpers (demo timezone = browser local). */

const DAY_MS = 86_400_000;

/** Local midnight as epoch ms for the calendar day containing `ms`. */
export function localDayStartMs(ms: number = Date.now()): number {
  const date = new Date(ms);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/** Local month (1–12) and day-of-month for `ms`. */
export function localMonthDay(ms: number = Date.now()): {
  month: number;
  day: number;
} {
  const date = new Date(ms);
  return { month: date.getMonth() + 1, day: date.getDate() };
}

/** UTC midnight for a UTC calendar day — used when day keys are stored as UTC truncations. */
export function utcDayStartMs(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Heatmap cells use UTC date_trunc. "Today" highlight should match the user's
 * local calendar date expressed as that same UTC day key when possible.
 * Prefer: local Y-M-D → Date.UTC(y, m-1, d).
 */
export function localCalendarDayAsUtcKey(ms: number = Date.now()): number {
  const date = new Date(ms);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(dayStartMs: number, days: number): number {
  return dayStartMs + days * DAY_MS;
}

/**
 * Seconds to add to a UTC epoch so EXTRACT(month/day) matches the browser's
 * local calendar (worker shares the page timezone).
 */
export function localUtcOffsetSeconds(ms: number = Date.now()): number {
  return -new Date(ms).getTimezoneOffset() * 60;
}

/**
 * DuckDB expression: shift a TIMESTAMP into local wall time before EXTRACT.
 * `offsetSeconds` must also be bound as a prepared parameter wherever `?` appears.
 */
export function localWallTimestampSql(
  column: string,
  offsetParam = "?",
): string {
  return `to_timestamp(epoch(${column}) + ${offsetParam})`;
}
