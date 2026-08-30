// When today's work actually starts and ends.
//
// The dashboard used to assume the working day was *daylight* — the hora
// allocator was handed the twelve daytime horas and placed tasks across all
// of them. That is a fine astronomical definition and a poor one for a person
// who wakes at 06:00 on Tuesday and 11:30 on Wednesday. A plan that starts at
// sunrise on the day you got up at noon isn't a plan, it's a reproach.
//
// So the working day is stated, not inferred. Two values, both wall-clock:
//
//   - Today's window, scoped to a single date, the same rule uiOverrides
//     follows. A late start on Wednesday must not quietly become Thursday's
//     shape as well; on a new day the usual pattern comes back on its own.
//   - The usual pattern, which is not scoped to a date and is what today
//     falls back to. Without it every morning would begin by re-entering the
//     same two numbers, and the feature would be abandoned inside a week.
//
// Stored as "HH:MM" strings rather than instants, for the same reason the
// schedule overrides are: "start at nine" means nine on the operator's clock,
// whatever timezone the server that renders it happens to be in.

import { currentUserKey } from "@/auth";
import { getJSON, setJSON, store } from "@/lib/store";
import { localDateISO, localMinutes, localNow, tzOffset } from "@/lib/timezone";

/** The fallback of last resort — used only until a pattern has been saved. */
export const DEFAULT_PATTERN = { start: "09:00", end: "18:00" } as const;

/** A working day is at least this long, or it isn't a working day. */
export const MIN_WINDOW_MINUTES = 30;

export interface WorkPattern {
  start: string;
  end: string;
  setAt: string;
}

export interface WorkDayRecord {
  dateISO: string;
  start: string;
  end: string;
  setAt: string;
  /** Present when the start came from tapping Woke Up rather than typing. */
  fromWake?: string;
}

export interface WorkWindow {
  dateISO: string;
  /** "HH:MM", local wall clock. */
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  /** ISO instants for the same two moments, for anything that needs to
   *  compare against a hora or a calendar event. */
  startISO: string;
  endISO: string;
  /**
   * Where the numbers came from, so the screen can say so:
   *   manual  — set for today, explicitly
   *   wake    — derived from the Woke Up tap and accepted
   *   pattern — the saved usual day
   *   default — nothing has ever been set
   */
  source: "manual" | "wake" | "pattern" | "default";
  /** True once the end time is behind us. */
  over: boolean;
  /** Minutes of the window still ahead, 0 once it's over. */
  remainingMinutes: number;
}

const patternKey = (u: string) => `work-pattern:${u}`;
const dayKey = (u: string) => `work-day:${u}`;

/* ------------------------------------------------------------------ */
/* "HH:MM" <-> minutes <-> instants                                    */
/* ------------------------------------------------------------------ */

export function parseHHMM(value: string | undefined | null): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function formatHHMM(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * The instant a wall-clock time falls on, for a given local date.
 *
 * Built from the date string and the configured offset rather than from
 * `new Date(\`${date}T${time}\`)`, which parses in the SERVER's timezone — the
 * bug that had every hora on the dashboard reading five and a half hours
 * early once this was deployed to Vercel.
 */
export function instantFor(dateISO: string, minutes: number, offsetHours = tzOffset()): string {
  const midnightUTC = new Date(`${dateISO}T00:00:00Z`).getTime();
  return new Date(midnightUTC + minutes * 60_000 - offsetHours * 3_600_000).toISOString();
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export async function getWorkPattern(): Promise<WorkPattern | null> {
  const userKey = await currentUserKey();
  const stored = await getJSON<WorkPattern | null>(patternKey(userKey), null);
  if (!stored || parseHHMM(stored.start) === null || parseHHMM(stored.end) === null) return null;
  return stored;
}

/**
 * Today's window, resolved through today → pattern → default.
 *
 * Never throws and never returns null: every caller downstream — the
 * allocator, the calendar push, the chat's view of the screen — needs a
 * window to reason about, and "there isn't one" would have each of them
 * inventing a different fallback.
 */
export async function getWorkWindow(dateISO: string = localDateISO()): Promise<WorkWindow> {
  const userKey = await currentUserKey();
  const [day, pattern] = await Promise.all([
    getJSON<WorkDayRecord | null>(dayKey(userKey), null),
    getWorkPattern(),
  ]);

  let start: string;
  let end: string;
  let source: WorkWindow["source"];

  if (day && day.dateISO === dateISO && parseHHMM(day.start) !== null && parseHHMM(day.end) !== null) {
    start = day.start;
    end = day.end;
    source = day.fromWake ? "wake" : "manual";
  } else if (pattern) {
    start = pattern.start;
    end = pattern.end;
    source = "pattern";
  } else {
    start = DEFAULT_PATTERN.start;
    end = DEFAULT_PATTERN.end;
    source = "default";
  }

  return describeWindow(dateISO, parseHHMM(start)!, parseHHMM(end)!, source);
}

export function describeWindow(
  dateISO: string,
  startMinutes: number,
  endMinutes: number,
  source: WorkWindow["source"]
): WorkWindow {
  const nowMinutes = localMinutes(localNow());
  const isToday = dateISO === localDateISO();
  return {
    dateISO,
    start: formatHHMM(startMinutes),
    end: formatHHMM(endMinutes),
    startMinutes,
    endMinutes,
    startISO: instantFor(dateISO, startMinutes),
    endISO: instantFor(dateISO, endMinutes),
    source,
    over: isToday ? nowMinutes >= endMinutes : false,
    remainingMinutes: isToday ? Math.max(0, endMinutes - Math.max(nowMinutes, startMinutes)) : endMinutes - startMinutes,
  };
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

export class WorkWindowError extends Error {}

/**
 * Validates a pair of wall-clock times as a working day.
 *
 * An end before a start is rejected rather than rolled over to the next
 * morning. A night shift is a real thing and this does not model it yet;
 * silently turning 22:00–06:00 into a sixteen-hour inverted window would put
 * blocks on the calendar at times nobody asked for, which is worse than
 * saying no.
 */
export function validateWindow(start: string, end: string): { startMinutes: number; endMinutes: number } {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s === null) throw new WorkWindowError("Start time should look like 09:30.");
  if (e === null) throw new WorkWindowError("End time should look like 18:00.");
  if (e <= s) throw new WorkWindowError("The end has to be after the start — overnight shifts aren't supported yet.");
  if (e - s < MIN_WINDOW_MINUTES) throw new WorkWindowError(`A working day needs at least ${MIN_WINDOW_MINUTES} minutes.`);
  return { startMinutes: s, endMinutes: e };
}

export async function setWorkWindow(input: {
  start: string;
  end: string;
  dateISO?: string;
  /** Also save this as the usual day, so tomorrow starts from it. */
  alsoPattern?: boolean;
  /** The wake time this start was derived from, when it came from /sleep. */
  fromWake?: string;
}): Promise<WorkWindow> {
  const dateISO = input.dateISO || localDateISO();
  const { startMinutes, endMinutes } = validateWindow(input.start, input.end);
  const userKey = await currentUserKey();
  const now = new Date().toISOString();

  const record: WorkDayRecord = {
    dateISO,
    start: formatHHMM(startMinutes),
    end: formatHHMM(endMinutes),
    setAt: now,
    ...(input.fromWake ? { fromWake: input.fromWake } : {}),
  };
  await setJSON(dayKey(userKey), record);
  if (input.alsoPattern) {
    await setJSON(patternKey(userKey), { start: record.start, end: record.end, setAt: now });
  }
  return describeWindow(dateISO, startMinutes, endMinutes, input.fromWake ? "wake" : "manual");
}

/** Drops today's window so the usual pattern takes over again. */
export async function clearWorkWindow(): Promise<WorkWindow> {
  const userKey = await currentUserKey();
  await store().del(dayKey(userKey));
  return getWorkWindow();
}

/* ------------------------------------------------------------------ */
/* The suggestion after waking                                         */
/* ------------------------------------------------------------------ */

/**
 * A start time proposed from when someone actually got up.
 *
 * Rounded up to the next quarter hour and given a buffer, because nobody
 * opens a 3D scene ninety seconds after opening their eyes. The length of the
 * day is carried over from the usual pattern rather than fixed at eight
 * hours: someone who normally works 10:00–20:00 and wakes at 07:00 wants a
 * ten-hour day starting early, not an eight-hour one.
 */
export async function suggestWindowFromWake(wakeISO: string, dateISO = localDateISO()): Promise<{
  start: string;
  end: string;
  bufferMinutes: number;
}> {
  const BUFFER = 45;
  const pattern = await getWorkPattern();
  const patternStart = parseHHMM(pattern?.start ?? DEFAULT_PATTERN.start)!;
  const patternEnd = parseHHMM(pattern?.end ?? DEFAULT_PATTERN.end)!;
  const length = Math.max(MIN_WINDOW_MINUTES, patternEnd - patternStart);

  const wakeMinutes = localMinutes(wakeISO);
  const start = Math.min(23 * 60, Math.ceil((wakeMinutes + BUFFER) / 15) * 15);
  // Never past midnight: a day that would run over is truncated to 23:45 and
  // the person can shorten it themselves. Rolling into tomorrow would put
  // calendar events on a date they never looked at.
  const end = Math.min(23 * 60 + 45, start + length);
  void dateISO;
  return { start: formatHHMM(start), end: formatHHMM(Math.max(start + MIN_WINDOW_MINUTES, end)), bufferMinutes: BUFFER };
}
