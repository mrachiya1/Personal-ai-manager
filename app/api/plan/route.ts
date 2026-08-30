// Today's plan: the work window, what is already booked, and every open task
// laid into what is left.
//
// GET builds it and returns it. It writes nothing — the plan is derived on
// every call from the window, the tasks and the calendar, so it is never
// stale and there is no third copy of the day to keep in sync.

import { NextResponse } from "next/server";
import { getTodayContext } from "@/lib/context";
import { buildDayPlan, type BusyInterval } from "@/lib/dayPlan";
import { listCalendarEvents, isGoogleCalendarConnected, isOurEvent } from "@/lib/googleCalendar";
import { localDateISO, tzOffset } from "@/lib/timezone";
import { getWorkWindow } from "@/lib/workday";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateISO = url.searchParams.get("date") || localDateISO();
  const wholeWindow = url.searchParams.get("whole") === "1";

  const [window, ctx] = await Promise.all([getWorkWindow(dateISO), getTodayContext(dateISO)]);

  // Booked time. A calendar that cannot be reached must not take the plan
  // down with it — the day is planned across the whole window instead, and
  // the response says so, so the screen can warn rather than quietly lie.
  let busy: BusyInterval[] = [];
  let busyUnknown = false;
  if (isGoogleCalendarConnected()) {
    try {
      const events = await listCalendarEvents(dateISO, tzOffset());
      busy = events
        .filter((e) => !e.allDay && e.start && e.end)
        .map((e) => ({
          start: e.start,
          end: e.end,
          label: e.summary,
          // Our own blocks from a previous push are not other people's
          // meetings; re-planning must not treat them as immovable, or every
          // re-plan would produce a smaller day than the one before it.
          ours: isOurEvent(e),
        }));
    } catch {
      busyUnknown = true;
    }
  } else {
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
    wholeWindow,
  });

  return NextResponse.json({ plan, calendarConnected: isGoogleCalendarConnected() });
}
