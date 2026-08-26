import { NextResponse } from "next/server";
import { createDailyLog } from "@/lib/notion";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }
  try {
    await createDailyLog(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to create daily log" }, { status: 502 });
  }
}
