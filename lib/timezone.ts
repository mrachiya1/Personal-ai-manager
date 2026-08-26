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
