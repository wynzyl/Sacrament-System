// lib/dates.ts
// Date helpers for a parish in Asia/Manila.
//
// Appointment dates are *calendar dates* stored as UTC midnight (the
// parishioner's "2026-12-05" is stored as 2026-12-05T00:00:00Z) and the time of
// day is a separate "HH:MM" Manila wall-clock string. "Today" must therefore be
// computed as the current Manila calendar date, not the server's local date.

const MANILA_TZ = 'Asia/Manila';

/** Current (or given) instant as a Manila calendar date, "YYYY-MM-DD". */
export function manilaDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function manilaYear(d: Date = new Date()): number {
  return Number(manilaDateString(d).slice(0, 4));
}

/** "YYYY-MM-DD" -> Date at UTC midnight (how appointments store their date). */
export function dateOnlyToUtc(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

/** Date stored at UTC midnight -> "YYYY-MM-DD". */
export function utcToDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** True for a real calendar date in strict YYYY-MM-DD form (rejects 2026-02-31). */
export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = dateOnlyToUtc(value);
  return !Number.isNaN(d.getTime()) && utcToDateOnly(d) === value;
}

export function addDays(dateOnly: string, days: number): string {
  const d = dateOnlyToUtc(dateOnly);
  d.setUTCDate(d.getUTCDate() + days);
  return utcToDateOnly(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dateOnlyToUtc(b).getTime() - dateOnlyToUtc(a).getTime()) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday for a calendar date. */
export function dayOfWeek(dateOnly: string): number {
  return dateOnlyToUtc(dateOnly).getUTCDay();
}

/**
 * The instant range [start, end) covering a Manila calendar day, for filtering
 * timestamp columns (e.g. Payment.createdAt) by a "business day".
 */
export function manilaDayRange(dateOnly: string): { start: Date; end: Date } {
  const start = new Date(`${dateOnly}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}
