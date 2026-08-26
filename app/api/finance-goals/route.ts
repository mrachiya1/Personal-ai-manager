import { NextResponse } from "next/server";
import { createFinanceGoal } from "@/lib/notion";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.goal || body?.targetAmount === undefined) {
    return NextResponse.json({ error: "goal and targetAmount are required" }, { status: 400 });
  }
  try {
    await createFinanceGoal(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to add goal" }, { status: 502 });
  }
}
