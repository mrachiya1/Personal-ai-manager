import { NextResponse } from "next/server";
import { getSettings, saveSettings, setting } from "@/lib/settings";
import type { AppSettings } from "@/lib/settings";

const KEYS: (keyof AppSettings)[] = [
  "openRouterApiKey",
  "openRouterModel",
  "openRouterVisionModel",
  "googleServiceAccountEmail",
  "googleServiceAccountPrivateKey",
  "googleCalendarId",
  "prokeralaClientId",
  "prokeralaClientSecret",
  "astrologyApiUserId",
  "astrologyApiKey",
  "homeLat",
  "homeLon",
  "homeTzOffset",
  "birthDate",
];

const ENV_VAR: Record<string, string> = {
  openRouterApiKey: "OPENROUTER_API_KEY",
  openRouterModel: "OPENROUTER_MODEL",
  openRouterVisionModel: "OPENROUTER_VISION_MODEL",
  googleServiceAccountEmail: "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  googleServiceAccountPrivateKey: "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  googleCalendarId: "GOOGLE_CALENDAR_ID",
  prokeralaClientId: "PROKERALA_CLIENT_ID",
  prokeralaClientSecret: "PROKERALA_CLIENT_SECRET",
  astrologyApiUserId: "ASTROLOGY_API_USER_ID",
  astrologyApiKey: "ASTROLOGY_API_KEY",
  homeLat: "HOME_LAT",
  homeLon: "HOME_LON",
  homeTzOffset: "HOME_TZ_OFFSET",
  birthDate: "BIRTH_DATE",
};

export async function GET() {
  const stored = getSettings();
  const effective: Record<string, string | undefined> = {};
  const source: Record<string, "settings" | "env" | "none"> = {};
  for (const k of KEYS) {
    const v = setting(k, ENV_VAR[k]);
    effective[k] = v;
    source[k] = stored[k] ? "settings" : v ? "env" : "none";
  }
  return NextResponse.json({ values: effective, source });
}

export async function POST(req: Request) {
  const body = await req.json();
  const partial: Partial<AppSettings> = {};
  for (const k of KEYS) {
    if (k in body) (partial as any)[k] = body[k];
  }
  try {
    saveSettings(partial);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to save settings" }, { status: 500 });
  }
}
