// Pushing today's plan to Google Calendar.
//
// The plan is rebuilt here rather than accepted from the client. The browser
// could send anything, and a calendar is the one surface in this app that
// other people see — a meeting invite that came from a tampered payload is
// not a bug anyone wants to explain. The client sends nothing but the date.
//
// Two levels go up, which is what was asked for: a container event per
// segment ("Deep work 09:30–12:00"), and one event per task inside it. The
// segment is the thing worth defending against someone else's meeting
// request; the tasks are what gets ticked off.

import { NextResponse } from "next/server";
import { getTodayContext } from "@/lib/context";
import { buildDayPlan, type BusyInterval, type DayPlan } from "@/lib/dayPlan";
import {
  isGoogleCalendarConnected,
  isOurEvent,
  listCalendarEvents,
  replacePlanEvents,
  type PlanEventInput,
} from "@/lib/googleCalendar";
import { formatLocalTime, localDateISO, tzOffset } from "@/lib/timezone";
import { getWorkWindow } from "@/lib/workday";

export const dynamic = "force-dynamic";

/** The two-level event list for one plan. */
export function planToEvents(plan: DayPlan): PlanEventInput[] {
  const out: PlanEventInput[] = [];
  for (const seg of plan.segments) {
    const lines = seg.tasks.length
      ? seg.tasks.map((t) => `• ${formatLocalTime(t.start)} ${t.title}${t.projectName ? ` — ${t.projectName}` : ""}`)
      : ["(nothing scheduled in this block)"];
    out.push({
      kind: "segment",
      summary: `${seg.label}${seg.planets.length ? ` — ${seg.planets.join("/")} hora` : ""}`,
      description: [seg.reason, "", ...lines].join("\n"),
      startTime: seg.start,
      endTime: seg.end,
    });
    for (const t of seg.tasks) {
      out.push({
        kind: "task",
        summary: t.title,
        description: [
          t.projectName ? `Project: ${t.projectName}` : null,
          `Priority: ${t.priority}`,
          t.dueDate ? `Due: ${t.dueDate}${t.urgency === "overdue" ? " (overdue)" : ""}` : null,
          `In: ${seg.label}`,
        ]
          .filter(Boolean)
          .join("\n"),
        startTime: t.start,
        endTime: t.end,
      });
    }
  }
  return out;
}

export async function POST(req: Request) {
  if (!isGoogleCalendarConnected()) {
    return NextResponse.json(
      {
        error:
          "Google Calendar isn't set up yet — add your service account details on the Settings page (Integrations), then push again.",
      },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const dateISO = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : localDateISO();

  const [window, ctx] = await Promise.all([getWorkWindow(dateISO), getTodayContext(dateISO)]);

  let busy: BusyInterval[] = [];
  let busyUnknown = false;
  try {
    const events = await listCalendarEvents(dateISO, tzOffset());
    busy = events
      .filter((e) => !e.allDay && e.start && e.end)
      .map((e) => ({ start: e.start, end: e.end, label: e.summary, ours: isOurEvent(e) }));
  } catch {
    busyUnknown = true;
  }

  const plan = buildDayPlan({
    window,
    tasks: ctx.tasks,
    projects: ctx.projects,
    horaDay: ctx.horaDay,
    panchang: ctx.panchang,
    busy,
    busyUnknown,
    now: new Date(),
    todayISO: localDateISO(),
    wholeWindow: dateISO !== localDateISO(),
  });

  const events = planToEvents(plan);
  if (!events.length) {
    return NextResponse.json(
      {
        error:
          window.over
            ? `Your work window (${window.start}–${window.end}) has already ended today. Set new hours and push again.`
            : "There is nothing to put on the calendar — no open tasks fit inside your hours.",
      },
      { status: 400 }
    );
  }

  const result = await replacePlanEvents(dateISO, events, tzOffset());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json({
    ok: true,
    created: result.created,
    removed: result.removed,
    segments: plan.segments.length,
    tasks: plan.segments.reduce((n, s) => n + s.tasks.length, 0),
    unplaced: plan.unplaced.length,
    plan,
  });
}
