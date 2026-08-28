import { NextResponse } from "next/server";
import { getOpenSleepLog, startSleepLog, endSleepLog, createSleepLog } from "@/lib/notion";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    action: "start" | "end" | "manual";
    sleepISO?: string;
    wakeISO?: string;
    notes?: string;
  };
  const { action } = body;
  const now = new Date().toISOString();

  try {
    // A night you forgot to tap through. Unlike start/end this doesn't touch
    // the open-log state at all — it writes a complete, closed entry.
    if (action === "manual") {
      if (!body.sleepISO) {
        return NextResponse.json({ error: "A sleep time is required." }, { status: 400 });
      }
      await createSleepLog({ sleepISO: body.sleepISO, wakeISO: body.wakeISO, notes: body.notes });
      return NextResponse.json({ ok: true });
    }

    if (action === "start") {
      const open = await getOpenSleepLog();
      if (open) {
        return NextResponse.json({ error: "You already have an open sleep log — tap Woke Up first." }, { status: 409 });
      }
      await startSleepLog(now);
      return NextResponse.json({ ok: true });
    }

    if (action === "end") {
      const open = await getOpenSleepLog();
      if (!open || !open.sleepTime) {
        return NextResponse.json({ error: "No open sleep log to close — tap Went to Sleep first." }, { status: 409 });
      }
      await endSleepLog(open.id, open.sleepTime, now);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Sleep log request failed" }, { status: 502 });
  }
}
