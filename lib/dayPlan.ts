// The day, laid out inside the hours you actually said you were working.
//
// This is the allocator the Today page's schedule used to do inline, moved
// out and given the three inputs it was missing:
//
//   1. A stated work window instead of "daylight". Sunrise is not when this
//      operator starts and the two are often four hours apart.
//   2. What is already booked. A plan that puts deep work on top of a client
//      call is worse than no plan, because it will be believed once and then
//      never again.
//   3. Every open task, not just the ones dated today — because a task pool
//      filtered to today's due dates plans an empty day for a person with
//      thirty open items and no due dates on any of them.
//
// The output is deliberately two-level: named SEGMENTS carved out of the
// window by the quality of the hours they cover, and TASKS placed inside
// them. The segment is the thing a person defends in their calendar; the
// tasks are what they tick off. Both go to Google Calendar.

import type { Hora, HoraDay } from "./hora";
import { HORA_PROFILE } from "./hora";
import type { PanchangWindows } from "./panchang";
import type { Project, Task } from "./types";
import { formatLocalTime, localMinutes } from "./timezone";
import type { WorkWindow } from "./workday";

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export interface BusyInterval {
  start: string;
  end: string;
  label: string;
  /** Set for events this app put there itself, which are not real busy time. */
  ours?: boolean;
}

export type SegmentKind = "deep" | "admin" | "reset";

export interface PlannedTask {
  id: string;
  title: string;
  start: string;
  end: string;
  minutes: number;
  priority: string;
  projectId: string;
  projectName?: string;
  dueDate?: string;
  /** Late, due today, or neither — the only three states worth a colour. */
  urgency: "overdue" | "today" | null;
}

export interface PlannedSegment {
  id: string;
  kind: SegmentKind;
  label: string;
  start: string;
  end: string;
  minutes: number;
  /** Why this stretch got this label, in one line, from real inputs. */
  reason: string;
  planets: string[];
  tasks: PlannedTask[];
}

export interface DayPlan {
  dateISO: string;
  window: { start: string; end: string; startISO: string; endISO: string; source: WorkWindow["source"] };
  segments: PlannedSegment[];
  /** Tasks the day had no room for, in the order they would have been taken. */
  unplaced: { id: string; title: string; priority: string; projectName?: string; dueDate?: string }[];
  /** What was treated as already booked. */
  busy: BusyInterval[];
  /** True when the calendar could not be read and the plan ignored bookings. */
  busyUnknown: boolean;
  minutesPlanned: number;
  minutesFree: number;
}

/* ------------------------------------------------------------------ */
/* Time arithmetic                                                     */
/* ------------------------------------------------------------------ */

const ms = (iso: string) => new Date(iso).getTime();
const iso = (t: number) => new Date(t).toISOString();

interface Span {
  start: number;
  end: number;
}

/** a minus b, for a list of intervals. */
function subtract(spans: Span[], cuts: Span[]): Span[] {
  let out = spans;
  for (const cut of cuts) {
    const next: Span[] = [];
    for (const s of out) {
      if (cut.end <= s.start || cut.start >= s.end) {
        next.push(s);
        continue;
      }
      if (cut.start > s.start) next.push({ start: s.start, end: cut.start });
      if (cut.end < s.end) next.push({ start: cut.end, end: s.end });
    }
    out = next;
  }
  return out.filter((s) => s.end > s.start);
}

/* ------------------------------------------------------------------ */
/* Slicing the window by hora quality                                  */
/* ------------------------------------------------------------------ */

/**
 * The circadian dip, matching lib/dayEnergy.ts.
 *
 * Kept as its own constant rather than imported because the two use it for
 * different jobs — that file picks a rest window from the whole day, this one
 * only labels a stretch that already fell inside the stated hours.
 */
const DIP_START = 13 * 60;
const DIP_END = 16 * 60;

/** Above this an hour is worth defending as deep work. */
const DEEP_THRESHOLD = 0.62;

/** Past this, a "deep work" block is a fiction. Longer stretches are split. */
const MAX_DEEP_MINUTES = 150;

/** A slice shorter than this is not a block, it is a gap. */
const MIN_SEGMENT_MINUTES = 20;

function overlapMinutes(a: Span, b: Span): number {
  return Math.max(0, (Math.min(a.end, b.end) - Math.max(a.start, b.start)) / 60000);
}

function blockedFraction(span: Span, panchang: PanchangWindows | null): number {
  if (!panchang) return 0;
  const total = (span.end - span.start) / 60000 || 1;
  const blocked =
    overlapMinutes(span, { start: ms(panchang.rahuKalam.start), end: ms(panchang.rahuKalam.end) }) +
    overlapMinutes(span, { start: ms(panchang.yamagandam.start), end: ms(panchang.yamagandam.end) }) +
    overlapMinutes(span, { start: ms(panchang.gulikaKalam.start), end: ms(panchang.gulikaKalam.end) });
  return Math.min(1, blocked / total);
}

interface Slice extends Span {
  planet: string;
  focus: number;
  kind: SegmentKind;
}

/**
 * Cuts the free time into hora-sized pieces and labels each one.
 *
 * Every piece knows which planetary hour it came from and what fraction of it
 * sits inside an inauspicious window, so the reason printed next to a block
 * on the calendar points at a calculation rather than at a mood.
 */
function sliceByHora(free: Span[], horaDay: HoraDay | null, panchang: PanchangWindows | null): Slice[] {
  const horas: Hora[] = horaDay?.horas ?? [];
  const out: Slice[] = [];

  for (const span of free) {
    const covering = horas.filter((h) => ms(h.end) > span.start && ms(h.start) < span.end);
    // No hora data (the sunrise API was unreachable, say). One flat slice is
    // honest: the block still gets planned, it just cannot claim a reason it
    // does not have.
    if (!covering.length) {
      out.push({ ...span, planet: "", focus: 0.5, kind: "admin" });
      continue;
    }
    for (const h of covering) {
      const piece: Span = { start: Math.max(span.start, ms(h.start)), end: Math.min(span.end, ms(h.end)) };
      if (piece.end - piece.start < 60_000) continue;
      const profile = HORA_PROFILE[h.planet];
      const mid = localMinutes(iso((piece.start + piece.end) / 2));
      const inDip = mid >= DIP_START && mid < DIP_END;

      let focus = profile?.focusScore ?? 0.5;
      if (!h.daytime) focus *= 0.55;
      if (inDip) focus *= 0.7;
      focus *= 1 - 0.75 * blockedFraction(piece, panchang);

      const kind: SegmentKind = focus >= DEEP_THRESHOLD ? "deep" : inDip ? "reset" : "admin";
      out.push({ ...piece, planet: h.planet, focus, kind });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

const SEGMENT_LABEL: Record<SegmentKind, string> = {
  deep: "Deep work",
  admin: "Admin & delivery",
  reset: "Reset",
};

/** Merges touching slices of the same kind, then splits over-long deep runs. */
function toSegments(slices: Slice[], dateISO: string): PlannedSegment[] {
  const merged: { kind: SegmentKind; start: number; end: number; planets: string[]; focus: number[] }[] = [];
  for (const s of slices) {
    const last = merged[merged.length - 1];
    if (last && last.kind === s.kind && Math.abs(last.end - s.start) < 60_000) {
      last.end = s.end;
      if (s.planet) last.planets.push(s.planet);
      last.focus.push(s.focus);
    } else {
      merged.push({ kind: s.kind, start: s.start, end: s.end, planets: s.planet ? [s.planet] : [], focus: [s.focus] });
    }
  }

  const out: PlannedSegment[] = [];
  let n = 0;
  for (const m of merged) {
    const minutes = (m.end - m.start) / 60000;
    if (minutes < MIN_SEGMENT_MINUTES) continue;

    // Two hours and a half is the honest ceiling on one unbroken deep-work
    // run. A four-hour "deep work" block on a calendar is a block nobody
    // believes by hour three, and the calendar stops being trusted with it.
    const pieces: Span[] =
      m.kind === "deep" && minutes > MAX_DEEP_MINUTES
        ? splitEvenly({ start: m.start, end: m.end }, Math.ceil(minutes / MAX_DEEP_MINUTES))
        : [{ start: m.start, end: m.end }];

    for (const piece of pieces) {
      const planets = [...new Set(m.planets)];
      const avgFocus = m.focus.reduce((a, b) => a + b, 0) / (m.focus.length || 1);
      out.push({
        id: `${dateISO}:${m.kind}:${n++}`,
        kind: m.kind,
        label: SEGMENT_LABEL[m.kind] + (pieces.length > 1 ? ` ${pieces.indexOf(piece) + 1}` : ""),
        start: iso(piece.start),
        end: iso(piece.end),
        minutes: Math.round((piece.end - piece.start) / 60000),
        reason: reasonFor(m.kind, planets, avgFocus),
        planets,
        tasks: [],
      });
    }
  }
  return out;
}

function splitEvenly(span: Span, parts: number): Span[] {
  const step = (span.end - span.start) / parts;
  return Array.from({ length: parts }, (_, i) => ({
    start: span.start + i * step,
    end: i === parts - 1 ? span.end : span.start + (i + 1) * step,
  }));
}

function reasonFor(kind: SegmentKind, planets: string[], focus: number): string {
  const names = planets.join(" then ");
  const score = focus.toFixed(2);
  if (kind === "deep") {
    return names
      ? `${names} hora — focus ${score}, the best stretch your hours cover and clear of Rahu Kalam.`
      : `Focus ${score} — the strongest stretch inside your hours.`;
  }
  if (kind === "reset") {
    return names
      ? `${names} hora inside the 13:00–16:00 dip — focus ${score}. Alertness falls here whatever the sky is doing.`
      : `The 13:00–16:00 circadian dip. Kept clear on purpose.`;
  }
  return names
    ? `${names} hora — focus ${score}. Good enough for delivery, review and correspondence, not for the hard thing.`
    : `Focus ${score} — delivery and correspondence.`;
}

/* ------------------------------------------------------------------ */
/* The task pool                                                       */
/* ------------------------------------------------------------------ */

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, medium: 2, low: 3 };

/** How long one task is given, by its priority. */
const SLOT_MINUTES: Record<number, number> = { 0: 60, 1: 60, 2: 45, 3: 30 };

/** Below this a leftover stretch is not worth starting a task in. */
const MIN_TASK_MINUTES = 20;

function rank(priority?: string): number {
  return PRIORITY_RANK[(priority || "normal").toLowerCase()] ?? 2;
}

/**
 * Every task worth doing, best-first.
 *
 * Parents with children are dropped: "Shot 01 Animation" is not a thing
 * anybody sits down and does, its four sub-tasks are, and scheduling both
 * double-counts the same work. Tasks belonging to delivered projects go too —
 * they are open only because nobody tidied up.
 */
export function taskPool(tasks: Task[], projects: Project[], todayISO: string): Task[] {
  const hasChild = new Set(tasks.map((t) => t.parentTaskId).filter(Boolean) as string[]);
  const delivered = new Set(projects.filter((p) => p.status === "Delivered").map((p) => p.id));

  return tasks
    .filter((t) => t.status !== "Done" && !hasChild.has(t.id) && !delivered.has(t.projectId))
    .sort((a, b) => {
      // Overdue first, whatever its priority — a late task is a promise
      // already broken, and priority is a guess about the future.
      const aLate = a.dueDate && a.dueDate < todayISO ? 0 : 1;
      const bLate = b.dueDate && b.dueDate < todayISO ? 0 : 1;
      if (aLate !== bLate) return aLate - bLate;
      const r = rank(a.priority) - rank(b.priority);
      if (r) return r;
      const ad = a.dueDate || "9999-12-31";
      const bd = b.dueDate || "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

export function buildDayPlan(input: {
  window: WorkWindow;
  tasks: Task[];
  projects: Project[];
  horaDay: HoraDay | null;
  panchang: PanchangWindows | null;
  busy: BusyInterval[];
  busyUnknown: boolean;
  now: Date;
  todayISO: string;
  /** Plan the whole window rather than only the part still ahead. Used when
   *  laying out a day that has not started, and by the tests. */
  wholeWindow?: boolean;
}): DayPlan {
  const { window: w, todayISO } = input;
  const windowSpan: Span = { start: ms(w.startISO), end: ms(w.endISO) };

  // Nothing is planned into the past. Re-planning at 3pm should fill the
  // afternoon, not redraw a morning that already happened.
  const from =
    input.wholeWindow || w.dateISO !== todayISO ? windowSpan.start : Math.max(windowSpan.start, input.now.getTime());
  const open: Span[] = from < windowSpan.end ? [{ start: from, end: windowSpan.end }] : [];

  // Events this app wrote itself are not booked time — they are the previous
  // version of this same plan, and treating them as busy would make every
  // re-plan produce a smaller day than the one before it.
  const realBusy = input.busy.filter((b) => !b.ours);
  const free = subtract(
    open,
    realBusy.map((b) => ({ start: ms(b.start), end: ms(b.end) }))
  );

  const segments = toSegments(sliceByHora(free, input.horaDay, input.panchang), w.dateISO);
  const projectById = new Map(input.projects.map((p) => [p.id, p]));
  const pool = taskPool(input.tasks, input.projects, todayISO);

  // Deep work is filled first and from the top of the list, so the hardest
  // thing lands in the best hour rather than in whichever slot came next.
  const order = [...segments].sort((a, b) => {
    const kindRank = { deep: 0, admin: 1, reset: 2 } as const;
    if (kindRank[a.kind] !== kindRank[b.kind]) return kindRank[a.kind] - kindRank[b.kind];
    return ms(a.start) - ms(b.start);
  });

  const cursors = new Map(segments.map((s) => [s.id, ms(s.start)]));
  const placed = new Set<string>();

  for (const task of pool) {
    const want = SLOT_MINUTES[rank(task.priority)] ?? 45;
    let landed = false;
    for (const seg of order) {
      if (seg.kind === "reset") continue; // the dip is kept clear on purpose
      const cursor = cursors.get(seg.id)!;
      const room = (ms(seg.end) - cursor) / 60000;
      if (room < MIN_TASK_MINUTES) continue;
      const minutes = Math.min(want, room);
      const start = cursor;
      const end = cursor + minutes * 60000;
      const project = projectById.get(task.projectId);
      seg.tasks.push({
        id: task.id,
        title: task.title,
        start: iso(start),
        end: iso(end),
        minutes: Math.round(minutes),
        priority: task.priority || "Normal",
        projectId: task.projectId,
        projectName: project?.name,
        dueDate: task.dueDate,
        urgency: task.dueDate && task.dueDate < todayISO ? "overdue" : task.dueDate === todayISO ? "today" : null,
      });
      cursors.set(seg.id, end);
      placed.add(task.id);
      landed = true;
      break;
    }
    if (!landed) continue;
  }

  for (const seg of segments) seg.tasks.sort((a, b) => ms(a.start) - ms(b.start));

  const minutesPlanned = segments.reduce((n, s) => n + s.tasks.reduce((m, t) => m + t.minutes, 0), 0);
  const minutesFree = segments.filter((s) => s.kind !== "reset").reduce((n, s) => n + s.minutes, 0) - minutesPlanned;

  return {
    dateISO: w.dateISO,
    window: { start: w.start, end: w.end, startISO: w.startISO, endISO: w.endISO, source: w.source },
    segments,
    unplaced: pool
      .filter((t) => !placed.has(t.id))
      .map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority || "Normal",
        projectName: projectById.get(t.projectId)?.name,
        dueDate: t.dueDate,
      })),
    busy: input.busy,
    busyUnknown: input.busyUnknown,
    minutesPlanned,
    minutesFree: Math.max(0, minutesFree),
  };
}

/** One line per segment, for the chat and for a calendar description. */
export function describePlan(plan: DayPlan): string[] {
  const out = [`${plan.window.start}–${plan.window.end} (${plan.window.source})`];
  for (const s of plan.segments) {
    out.push(`${formatLocalTime(s.start)}–${formatLocalTime(s.end)} ${s.label} — ${s.tasks.length} task${s.tasks.length === 1 ? "" : "s"}`);
    for (const t of s.tasks) out.push(`   ${formatLocalTime(t.start)} ${t.title}`);
  }
  if (plan.unplaced.length) out.push(`${plan.unplaced.length} didn't fit`);
  return out;
}
