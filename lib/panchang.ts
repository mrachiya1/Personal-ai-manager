// Deterministic Rahu Kalam / Yamagandam / Gulika Kalam calculation.
//
// Method: the sunrise-to-sunset daylight period is split into 8 equal parts
// ("octants", numbered 1-8 starting right after sunrise). Each weekday maps
// to one fixed octant for each of the three periods — this is the standard
// classical panchang method, verified against published weekday timing
// tables. No paid astrology API is needed for this: sunrise/sunset comes
// from the free, keyless api.sunrise-sunset.org service, so this works even
// if PROKERALA_* / ASTROLOGY_API_* are never configured.
//
// This closes the "Transit protocol — requested but not yet automated" item
// from the founder bio-profile: block cold outreach, live deploys, contract
// sign-offs, and new company filings during these windows; route
// study/documentation/asset-organization into them instead.

import { localDateISO } from "./timezone";
import { settingNumber } from "./settings";


// Neutral fallback (Greenwich) so a fresh install computes *something*
// sensible. Each user sets their own coordinates in Settings → Personal;
// these are only used until they do.
const DEFAULT_LAT = 51.4779;
const DEFAULT_LON = 0.0;


// Home coordinates — override on the Settings page, or with HOME_LAT /
// HOME_LON in .env.local, if you're somewhere else on a given day.

// Octant (1-8) by weekday, 0 = Sunday .. 6 = Saturday. Verified against
// published Rahu Kalam / Yamagandam / Kuligai timing tables.
const RAHU_OCTANT = [8, 2, 7, 5, 6, 4, 3];
const YAMAGANDAM_OCTANT = [5, 4, 3, 2, 1, 7, 6];
const GULIKA_OCTANT = [7, 6, 5, 4, 3, 2, 1];

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface PanchangWindow {
  start: string; // ISO
  end: string; // ISO
}

export interface PanchangWindows {
  date: string;
  weekdayName: string;
  sunrise: string;
  sunset: string;
  rahuKalam: PanchangWindow;
  yamagandam: PanchangWindow;
  gulikaKalam: PanchangWindow;
}

/**
 * One day's sun times, memoised for the life of the process.
 *
 * The dashboard asks for today's twice (panchang and horas) and tomorrow's
 * once, and the advisor asks again on every message. Without this, a single
 * page render makes three identical round trips to a free public API that has
 * every right to rate-limit us.
 */
const sunCache = new Map<string, { sunrise: string; sunset: string } | null>();

export async function fetchSunTimes(dateISO: string): Promise<{ sunrise: string; sunset: string } | null> {
  const lat0 = settingNumber("homeLat", "HOME_LAT", DEFAULT_LAT);
  const lon0 = settingNumber("homeLon", "HOME_LON", DEFAULT_LON);
  const cacheKey = `${dateISO}|${lat0}|${lon0}`;
  if (sunCache.has(cacheKey)) return sunCache.get(cacheKey)!;

  const result = await fetchSunTimesUncached(dateISO);
  // A failure is cached too, but only briefly — clearing it on the next tick
  // means a transient outage doesn't freeze the timing engine until restart.
  sunCache.set(cacheKey, result);
  if (!result) setTimeout(() => sunCache.delete(cacheKey), 30_000).unref?.();
  return result;
}

async function fetchSunTimesUncached(dateISO: string): Promise<{ sunrise: string; sunset: string } | null> {
  try {
    const lat = settingNumber("homeLat", "HOME_LAT", DEFAULT_LAT);
    const lon = settingNumber("homeLon", "HOME_LON", DEFAULT_LON);
    // Overridable so the QA harness can serve deterministic sun times — the
    // sandbox this is developed in has no route to the public endpoint, and
    // "the whole timing engine silently returns null" is not a state worth
    // shipping untested.
    // Bracket access on purpose: the bundler statically inlines
    // `process.env.FOO` at build time, which bakes in whatever the build
    // machine had (usually nothing) and makes the variable impossible to set
    // at runtime. Bracket access stays a real lookup.
    const base = process.env["SUNRISE_API_BASE"] || "https://api.sunrise-sunset.org";
    const url = `${base}/json?lat=${lat}&lng=${lon}&date=${dateISO}&formatted=0`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK") return null;
    return { sunrise: data.results.sunrise, sunset: data.results.sunset };
  } catch {
    return null;
  }
}

function octantWindow(sunrise: Date, sunset: Date, octant: number): PanchangWindow {
  const partMs = (sunset.getTime() - sunrise.getTime()) / 8;
  return {
    start: new Date(sunrise.getTime() + (octant - 1) * partMs).toISOString(),
    end: new Date(sunrise.getTime() + octant * partMs).toISOString(),
  };
}

export async function getPanchangWindows(
  dateISO: string = localDateISO()
): Promise<PanchangWindows | null> {
  const sun = await fetchSunTimes(dateISO);
  if (!sun) return null;

  const sunrise = new Date(sun.sunrise);
  const sunset = new Date(sun.sunset);
  // Anchor weekday to the calendar date itself (UTC noon) rather than the
  // server's local clock, so this can't drift a day off near midnight.
  const weekday = new Date(`${dateISO}T12:00:00Z`).getDay();

  return {
    date: dateISO,
    weekdayName: WEEKDAY_NAMES[weekday],
    sunrise: sunrise.toISOString(),
    sunset: sunset.toISOString(),
    rahuKalam: octantWindow(sunrise, sunset, RAHU_OCTANT[weekday]),
    yamagandam: octantWindow(sunrise, sunset, YAMAGANDAM_OCTANT[weekday]),
    gulikaKalam: octantWindow(sunrise, sunset, GULIKA_OCTANT[weekday]),
  };
}

export interface ActiveWindow {
  name: string;
  window: PanchangWindow;
}

export function activeWindowNow(win: PanchangWindows | null, now: Date = new Date()): ActiveWindow | null {
  if (!win) return null;
  const t = now.getTime();
  const candidates: [string, PanchangWindow][] = [
    ["Rahu Kalam", win.rahuKalam],
    ["Yamagandam", win.yamagandam],
    ["Gulika Kalam", win.gulikaKalam],
  ];
  for (const [name, w] of candidates) {
    if (t >= new Date(w.start).getTime() && t < new Date(w.end).getTime()) {
      return { name, window: w };
    }
  }
  return null;
}
