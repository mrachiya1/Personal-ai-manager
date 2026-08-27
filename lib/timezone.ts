// `new Date().toISOString()` is ALWAYS UTC by spec — using `.slice(0, 10)` on
// it to get "today's date" is wrong once the server's clock and your actual
// local calendar day disagree (e.g. it's already Thursday locally in Sri
// Lanka at 3am, while UTC still says Wednesday). This bit the Today page,
// Astro Lab, and the Rahu Kalam calculation, all showing yesterday's date.
//
// Fix: shift the timestamp by a configured offset before reading it, so
// "today" always means *your* calendar day regardless of what timezone the
// machine running the server happens to be set to (which matters here since
// this app has been run from both a Sri Lanka desktop and a UTC cloud
// sandbox during development).

import { settingNumber } from "./settings";
import { formatTimeAt, minutesAt } from "./clock";

function defaultTzOffset(): number {
  return settingNumber("homeTzOffset", "HOME_TZ_OFFSET", 5.5); // Sri Lanka = UTC+5:30
}

export function localNow(offsetHours: number = defaultTzOffset()): Date {
  return new Date(Date.now() + offsetHours * 3600_000);
}

/** Today's date, YYYY-MM-DD, in the configured local timezone. */
export function localDateISO(offsetHours: number = defaultTzOffset()): string {
  return localNow(offsetHours).toISOString().slice(0, 10);
}

/** This month, YYYY-MM, in the configured local timezone. */
export function localMonthISO(offsetHours: number = defaultTzOffset()): string {
  return localNow(offsetHours).toISOString().slice(0, 7);
}

/**
 * Clock time for an instant, in the configured local timezone.
 *
 * `new Date(iso).toLocaleTimeString()` renders in the *server's* timezone,
 * which on Vercel is UTC — so every Rahu Kalam and hora time on the
 * dashboard would have read five and a half hours early once deployed,
 * silently and plausibly enough that nobody would question it. Shift first,
 * then format as UTC, and the answer is right wherever this runs.
 */
export function formatLocalTime(iso: string | Date, offsetHours: number = defaultTzOffset()): string {
  return formatTimeAt(iso, offsetHours);
}

/** Hour of day, 0-23, in the configured local timezone. */
export function localHour(offsetHours: number = defaultTzOffset()): number {
  return localNow(offsetHours).getUTCHours();
}

/** Minutes since local midnight for an instant — handy for laying out a day. */
export function localMinutes(iso: string | Date, offsetHours: number = defaultTzOffset()): number {
  return minutesAt(iso, offsetHours);
}

/** The configured offset itself, for handing to client components. */
export function tzOffset(): number {
  return defaultTzOffset();
}
