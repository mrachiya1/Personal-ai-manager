import { NextResponse } from "next/server";
import { getOpenSleepLog, startSleepLog, endSleepLog } from "@/lib/notion";

export async function POST(req: Request) {
  const { action } = (await req.json()) as { action: "start" | "end" };
  const now = new Date().toISOString();

  try {
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
