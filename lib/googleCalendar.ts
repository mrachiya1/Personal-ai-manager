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
// What is and isn't proven, precisely:
//
//   Proven — the JWT is built and signed correctly, the token exchange is
//   shaped the way Google documents, events are written and deleted with the
//   right bodies, and a whole day's plan replaces the previous one instead of
//   duplicating it. `qa/calendar.sh` drives all of that against a stand-in
//   Google that verifies the signature with the public key.
//
//   NOT proven — that real Google accepts it. The stand-in cannot test the
//   parts only Google knows: whether the service account was actually shared
//   onto the calendar, whether the Calendar API is enabled on the project,
//   quota, and the exact error strings. This environment has no egress to
//   googleapis.com. The first run against real credentials is still the first
//   real test of those, and errors surface verbatim so you can see which.

import crypto from "crypto";
import { setting } from "./settings";

/**
 * The endpoints, read at call time through bracket access.
 *
 * `process.env.FOO` is INLINED by the Next bundler at build time, baking in
 * whatever the build machine happened to have — the bug that froze the Notion
 * base URL once already. Bracket access stays a real runtime lookup, which is
 * also what lets the QA harness point this whole file at a stand-in Google
 * and exercise a flow that has never once run against the real one.
 */
function endpoints() {
  // Written as `process.env["X"]` at the point of use, exactly like the Notion
  // and OpenRouter bases. Aliasing it first (`const env = process.env`) reads
  // as equivalent and is not: the bundler hands the alias a snapshot, so the
  // override silently did nothing and every call went to real Google — which,
  // from this sandbox, fails as "couldn't get an access token" rather than as
  // anything that points at the cause.
  return {
    token: process.env["GOOGLE_TOKEN_URL"] || "https://oauth2.googleapis.com/token",
    calendar: process.env["GOOGLE_CALENDAR_BASE"] || "https://www.googleapis.com/calendar/v3",
  };
}

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
    const res = await fetch(endpoints().token, {
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
      `${endpoints().calendar}/calendars/${encodeURIComponent(calendarId!)}/events`,
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

/**
 * The marker that says "this app wrote this".
 *
 * It goes in `extendedProperties.private`, which is invisible in the Google
 * Calendar UI and searchable through the API — the two things it has to be.
 * Without it, pushing the plan twice in one morning leaves two of everything,
 * and the only way to clean up is by hand.
 *
 * It is also written into the description, because `privateExtendedProperty`
 * search has been known to lag on freshly written events, and a plan that
 * cannot find yesterday's blocks would duplicate them. Belt and braces on a
 * delete path is cheap; a duplicated calendar is not.
 */
export const PLAN_TAG = "orex-os-plan";

export interface CalendarEvent {
  id: string;
  summary: string;
  /** ISO datetime, or the date itself for an all-day event. */
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  attendees: number;
  htmlLink?: string;
  description?: string;
  /** True when this app created the event as part of a day plan. */
  ours?: boolean;
}

/** Whether an event on the calendar is one this app put there. */
export function isOurEvent(e: CalendarEvent): boolean {
  return Boolean(e.ours || e.description?.includes(PLAN_TAG));
}

/**
 * Today's events, oldest first.
 *
 * Returns an empty list — never throws — when Calendar isn't configured or
 * the call fails, because a broken integration must not take the dashboard
 * down with it. Untested against live credentials from this environment for
 * the same reason as the rest of this file.
 */
export async function listCalendarEvents(dateISO: string, tzOffsetHours = 5.5): Promise<CalendarEvent[]> {
  if (!isGoogleCalendarConnected()) return [];
  const token = await getAccessToken();
  if (!token) return [];
  const { calendarId } = googleConfig();

  // The local day, expressed as the UTC instants that bound it.
  const dayStart = new Date(`${dateISO}T00:00:00Z`).getTime() - tzOffsetHours * 3600_000;
  const dayEnd = dayStart + 86400_000;

  try {
    const params = new URLSearchParams({
      timeMin: new Date(dayStart).toISOString(),
      timeMax: new Date(dayEnd).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "25",
    });
    const res = await fetch(
      `${endpoints().calendar}/calendars/${encodeURIComponent(calendarId!)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map(toEvent);
  } catch {
    return [];
  }
}

function toEvent(e: any): CalendarEvent {
  return {
    id: e.id,
    summary: e.summary || "(no title)",
    start: e.start?.dateTime || e.start?.date || "",
    end: e.end?.dateTime || e.end?.date || "",
    allDay: !e.start?.dateTime,
    location: e.location,
    attendees: Array.isArray(e.attendees) ? e.attendees.length : 0,
    htmlLink: e.htmlLink,
    description: e.description,
    ours: e.extendedProperties?.private?.[PLAN_TAG] !== undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Writing a whole day, replacing the last one                         */
/* ------------------------------------------------------------------ */

export interface PlanEventInput {
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  /** "segment" or "task" — stored so a later push can tell them apart. */
  kind: string;
}

/**
 * Replaces this app's events for one day with a new set.
 *
 * Delete-then-create rather than diff-and-patch, deliberately. A plan is
 * regenerated wholesale every time anything about the day changes — the
 * hours, a finished task, a meeting that appeared — so matching old events to
 * new ones would be inventing an identity the plan does not have. Events the
 * person made themselves are never touched: only ones carrying PLAN_TAG.
 *
 * Deletions run before any creation. The reverse order would leave a
 * duplicated day behind if the process died in between, which is the failure
 * mode that makes people stop trusting a sync.
 */
export async function replacePlanEvents(
  dateISO: string,
  events: PlanEventInput[],
  tzOffsetHours = 5.5
): Promise<{ ok: true; created: number; removed: number; links: string[] } | { ok: false; error: string }> {
  if (!isGoogleCalendarConnected()) {
    return { ok: false, error: "Google Calendar isn't configured — add your service account details on the Settings page." };
  }
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "Couldn't get a Google access token — check your service account credentials." };
  const { calendarId } = googleConfig();
  const base = `${endpoints().calendar}/calendars/${encodeURIComponent(calendarId!)}/events`;

  let removed = 0;
  try {
    const existing = await listCalendarEvents(dateISO, tzOffsetHours);
    for (const e of existing) {
      if (!isOurEvent(e)) continue;
      const res = await fetch(`${base}/${encodeURIComponent(e.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      // 410 means it is already gone, which is the state we wanted.
      if (res.ok || res.status === 410) removed += 1;
    }
  } catch (err: any) {
    return { ok: false, error: `Couldn't clear the previous plan: ${err?.message || "unknown error"}` };
  }

  const links: string[] = [];
  let created = 0;
  for (const e of events) {
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: e.summary,
          description: [e.description, `— ${PLAN_TAG}`].filter(Boolean).join("\n\n"),
          start: { dateTime: e.startTime },
          end: { dateTime: e.endTime },
          extendedProperties: { private: { [PLAN_TAG]: e.kind, [`${PLAN_TAG}-date`]: dateISO } },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          error: `${data?.error?.message || `Google Calendar API ${res.status}`} (${created} of ${events.length} written — re-run to finish)`,
        };
      }
      created += 1;
      if (data.htmlLink) links.push(data.htmlLink);
    } catch (err: any) {
      return { ok: false, error: `${err?.message || "Calendar write failed"} (${created} of ${events.length} written)` };
    }
  }

  return { ok: true, created, removed, links };
}
