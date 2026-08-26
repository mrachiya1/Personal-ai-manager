// Google Calendar sync via a service account (no interactive OAuth consent
// flow, no browser redirect — appropriate for a local single-user tool).
//
// Setup (one-time, in Google Cloud Console):
//   1. Create a project -> enable the "Google Calendar API".
//   2. Create a Service Account -> add a JSON key -> download it.
//   3. From that JSON, copy `client_email` -> GOOGLE_SERVICE_ACCOUNT_EMAIL,
//      and `private_key` -> GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (keep the
//      \n escapes as-is, paste the whole thing in quotes in .env.local).
//   4. In Google Calendar (your normal calendar), Settings -> Share with
//      specific people -> add the service account's email with
//      "Make changes to events" permission.
//   5. Set GOOGLE_CALENDAR_ID to your calendar's ID (Settings -> Integrate
//      calendar -> Calendar ID — usually your Gmail address for the
//      primary calendar).
//
// This has NOT been tested against real credentials from this environment
// (network to accounts.google.com/googleapis.com is blocked in the cloud
// sandbox this was built in) — the JWT/token-exchange flow follows Google's
// documented service-account flow exactly, but the first real run is the
// first real test. Errors surface directly so you'll see what's wrong.

import crypto from "crypto";
import { setting } from "./settings";

// Settings-store values (from the Settings page) win over .env.local — see
// lib/settings.ts. Read fresh each call rather than cached at module load,
// since these can now change at runtime without a server restart.
function googleConfig() {
  return {
    clientEmail: setting("googleServiceAccountEmail", "GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: setting("googleServiceAccountPrivateKey", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")?.replace(/\\n/g, "\n"),
    calendarId: setting("googleCalendarId", "GOOGLE_CALENDAR_ID"),
  };
}

export function isGoogleCalendarConnected(): boolean {
  const { clientEmail, privateKey, calendarId } = googleConfig();
  return Boolean(clientEmail && privateKey && calendarId);
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cachedToken: { token: string; expiresAt: number; forKey: string } | null = null;

async function getAccessToken(): Promise<string | null> {
  const { clientEmail, privateKey } = googleConfig();
  if (!clientEmail || !privateKey) return null;
  if (cachedToken && cachedToken.forKey === clientEmail && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claims}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  const jwt = `${signingInput}.${base64url(signature)}`;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    cachedToken = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000, forKey: clientEmail };
    return cachedToken.token;
  } catch {
    return null;
  }
}

export async function createCalendarEvent(input: {
  summary: string;
  description?: string;
  date: string; // YYYY-MM-DD — creates an all-day event unless startTime/endTime are given
  startTime?: string; // ISO datetime — when set (with endTime), creates a timed event instead of all-day
  endTime?: string; // ISO datetime
}): Promise<{ ok: true; htmlLink?: string } | { ok: false; error: string }> {
  if (!isGoogleCalendarConnected()) {
    return { ok: false, error: "Google Calendar isn't configured — add your service account details on the Settings page." };
  }
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "Couldn't get a Google access token — check your service account credentials." };
  const { calendarId } = googleConfig();

  const timed = Boolean(input.startTime && input.endTime);

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId!)}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: input.summary,
          description: input.description,
          start: timed ? { dateTime: input.startTime } : { date: input.date },
          end: timed ? { dateTime: input.endTime } : { date: input.date },
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message || `Google Calendar API ${res.status}` };
    return { ok: true, htmlLink: data.htmlLink };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Calendar sync failed" };
  }
}
