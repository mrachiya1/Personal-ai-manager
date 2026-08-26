// A tiny local settings store, so parts of the app that are currently
// .env.local-only (AI model/keys, Google Calendar, astrology APIs, home
// location, birth date) can also be changed from the Settings page in the
// browser — no file editing or server restart required.
//
// Storage: a plain JSON file at data/app-settings.json (gitignored, and
// deliberately excluded when this app is zipped up and shipped as an
// update — see the shipping notes in the build-status doc — so an update
// never overwrites settings you've saved here on your own machine).
//
// Design: every value here is OPTIONAL. If a key isn't set in this file,
// the corresponding process.env.* value (from .env.local) is used instead
// — so nothing breaks for anyone who never opens the Settings page. This
// is also what makes the app viable as a template for other people/companies
// to run their own instance of: each install can configure its own API keys
// and model choice from the UI instead of you hand-editing their env file.
//
// NOT settings-store-backed on purpose: NOTION_API_KEY and the Notion
// database IDs. Notion is the structural data backbone this whole app reads
// from — the database IDs baked into lib/notion.ts are specific to one
// workspace, so swapping the API key alone from a form wouldn't give you a
// working app anyway (every database ID would need to change too). That's a
// bigger "connect your own workspace" flow, not a settings field.

import fs from "fs";
import path from "path";

export interface AppSettings {
  openRouterApiKey?: string;
  openRouterModel?: string;
  openRouterVisionModel?: string;
  googleServiceAccountEmail?: string;
  googleServiceAccountPrivateKey?: string;
  googleCalendarId?: string;
  prokeralaClientId?: string;
  prokeralaClientSecret?: string;
  astrologyApiUserId?: string;
  astrologyApiKey?: string;
  homeLat?: string;
  homeLon?: string;
  homeTzOffset?: string;
  birthDate?: string;
}

const SETTINGS_PATH = path.join(process.cwd(), "data", "app-settings.json");

let cache: AppSettings | null = null;
let cacheMtimeMs = 0;

function load(): AppSettings {
  try {
    const stat = fs.statSync(SETTINGS_PATH);
    if (cache && stat.mtimeMs === cacheMtimeMs) return cache;
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    cache = JSON.parse(raw) as AppSettings;
    cacheMtimeMs = stat.mtimeMs;
    return cache;
  } catch {
    if (!cache) cache = {};
    return cache;
  }
}

export function getSettings(): AppSettings {
  return load();
}

/** Saves the given fields. An empty string clears that field back to its .env.local default. */
export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current: AppSettings = { ...load() };
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) continue;
    if (v === "") {
      delete (current as any)[k];
    } else {
      (current as any)[k] = v;
    }
  }
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(current, null, 2));
    cacheMtimeMs = fs.statSync(SETTINGS_PATH).mtimeMs;
  } catch (err) {
    // Serverless hosts (Vercel) give you a read-only filesystem. Keeping the
    // value in memory means the change takes effect for this running instance
    // instead of throwing a 500 in the user's face; the Settings page is
    // explicit that these particular fields need env vars in production.
    cacheMtimeMs = 0;
    console.warn(
      "[orex/settings] Couldn't persist data/app-settings.json (read-only filesystem?). " +
        "Change applied in memory only — set these as environment variables in production.",
      err instanceof Error ? err.message : err
    );
  }
  cache = current;
  return current;
}

/** Effective string value: the settings-store override wins, else the given env var, else undefined. */
export function setting(key: keyof AppSettings, envVar?: string): string | undefined {
  const stored = load()[key];
  if (stored) return stored;
  return envVar ? process.env[envVar] : undefined;
}

export function settingNumber(key: keyof AppSettings, envVar: string, fallback: number): number {
  const raw = setting(key, envVar);
  const n = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** True if this field has an override saved in the settings store (vs. falling back to .env.local). */
export function isOverridden(key: keyof AppSettings): boolean {
  return Boolean(load()[key]);
}
