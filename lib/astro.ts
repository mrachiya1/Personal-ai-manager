// Astrology data client — supports two providers, tried in this order:
//   1. Prokerala (OAuth2 client_credentials) — set PROKERALA_CLIENT_ID / PROKERALA_CLIENT_SECRET
//   2. AstrologyAPI.com (HTTP Basic Auth)     — set ASTROLOGY_API_USER_ID / ASTROLOGY_API_KEY
// Whichever is configured is used; if both are, Prokerala is tried first and
// AstrologyAPI.com is the fallback. If neither is set, or every call fails,
// callers get `null` back and the Astro Lab page shows a "connect an
// astrology API" empty state instead of breaking.
//
// Rahu Kalam / Yamagandam / Gulika Kalam do NOT depend on either of these —
// see lib/panchang.ts, which computes them locally from free sunrise/sunset
// data and works with zero astrology API keys configured.

import { setting, settingNumber } from "./settings";


// Neutral fallback (Greenwich) so a fresh install computes *something*
// sensible. Each user sets their own coordinates in Settings → Personal;
// these are only used until they do.
const DEFAULT_LAT = 51.4779;
const DEFAULT_LON = 0.0;


export interface TransitData {
  fetchedAt: string;
  provider: "prokerala" | "astrologyapi";
  keyTransits: string[];
  raw?: unknown;
}

// Settings-store values (from the Settings page) win over .env.local — read
// fresh per call rather than cached at module load, since these can change
// at runtime now.
function prokeralaConfig() {
  return {
    id: setting("prokeralaClientId", "PROKERALA_CLIENT_ID"),
    secret: setting("prokeralaClientSecret", "PROKERALA_CLIENT_SECRET"),
  };
}
function astrologyApiConfig() {
  return {
    userId: setting("astrologyApiUserId", "ASTROLOGY_API_USER_ID"),
    key: setting("astrologyApiKey", "ASTROLOGY_API_KEY"),
  };
}
function homeCoords() {
  return {
    lat: settingNumber("homeLat", "HOME_LAT", DEFAULT_LAT),
    lon: settingNumber("homeLon", "HOME_LON", DEFAULT_LON),
  };
}

export function isAstroConnected(): boolean {
  const { id, secret } = prokeralaConfig();
  const { userId, key } = astrologyApiConfig();
  return Boolean((id && secret) || (userId && key));
}

// --- Prokerala -------------------------------------------------------------
// Docs: https://api.prokerala.com/docs — OAuth2 client_credentials grant,
// token endpoint at /token, data endpoints under /v2/astrology/*.

let cachedToken: { token: string; expiresAt: number; forId: string } | null = null;

async function getProkeralaToken(): Promise<string | null> {
  const { id, secret } = prokeralaConfig();
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.forId === id && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  try {
    const res = await fetch("https://api.prokerala.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: id,
        client_secret: secret,
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    cachedToken = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000, forId: id };
    return cachedToken.token;
  } catch {
    return null;
  }
}

/** ISO datetime with a fixed timezone offset, as Prokerala's `datetime` param expects. */
function toOffsetISOString(dateISO: string, tzOffsetHours = 5.5): string {
  const utcNoon = new Date(`${dateISO}T12:00:00Z`);
  const local = new Date(utcNoon.getTime() + tzOffsetHours * 3600_000);
  const iso = local.toISOString().slice(0, 19);
  const sign = tzOffsetHours >= 0 ? "+" : "-";
  const abs = Math.abs(tzOffsetHours);
  const hh = String(Math.floor(abs)).padStart(2, "0");
  const mm = String(Math.round((abs % 1) * 60)).padStart(2, "0");
  return `${iso}${sign}${hh}:${mm}`;
}

async function fetchFromProkerala(params: { date: string; lat: number; lon: number }): Promise<TransitData | null> {
  const token = await getProkeralaToken();
  if (!token) return null;

  try {
    const url = new URL("https://api.prokerala.com/v2/astrology/planet-position");
    url.searchParams.set("ayanamsa", "1");
    url.searchParams.set("coordinates", `${params.lat},${params.lon}`);
    url.searchParams.set("datetime", toOffsetISOString(params.date));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();

    const planets: any[] = data?.data?.planet_position ?? [];
    const keyTransits = planets.map(
      (p) => `${p.name} in ${p.rasi?.name ?? p.sign ?? "?"}${p.is_retrograde ? " (retrograde)" : ""}`
    );

    return { fetchedAt: new Date().toISOString(), provider: "prokerala", keyTransits, raw: data };
  } catch {
    return null;
  }
}

// --- AstrologyAPI.com --------------------------------------------------
// Docs: https://astrologyapi.com/docs — HTTP Basic Auth with user_id:api_key,
// POST to https://json.astrologyapi.com/v1/planet_panchang.

async function fetchFromAstrologyApi(params: { date: string; lat: number; lon: number }): Promise<TransitData | null> {
  const { userId, key } = astrologyApiConfig();
  if (!userId || !key) return null;

  try {
    const [year, month, day] = params.date.split("-").map(Number);
    const auth = Buffer.from(`${userId}:${key}`).toString("base64");

    const res = await fetch("https://json.astrologyapi.com/v1/planet_panchang", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        "Accept-Language": "en",
      },
      body: JSON.stringify({
        day,
        month,
        year,
        hour: 12,
        min: 0,
        lat: params.lat,
        lon: params.lon,
        tzone: 5.5,
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();

    const keyTransits: string[] = Array.isArray(data)
      ? data.map((p: any) => `${p.name} in ${p.sign}${p.isRetro === "true" ? " (retrograde)" : ""}`)
      : [];

    return { fetchedAt: new Date().toISOString(), provider: "astrologyapi", keyTransits, raw: data };
  } catch {
    return null;
  }
}

// --- Public API --------------------------------------------------------

export async function fetchCurrentTransits(params: {
  date: string; // YYYY-MM-DD
  lat?: number;
  lon?: number;
}): Promise<TransitData | null> {
  if (!isAstroConnected()) return null;
  const home = homeCoords();
  const lat = params.lat ?? home.lat;
  const lon = params.lon ?? home.lon;

  const viaProkerala = await fetchFromProkerala({ date: params.date, lat, lon });
  if (viaProkerala) return viaProkerala;

  return fetchFromAstrologyApi({ date: params.date, lat, lon });
}
