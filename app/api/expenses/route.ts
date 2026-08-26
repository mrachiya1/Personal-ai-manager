import { NextResponse } from "next/server";
import { createExpense } from "@/lib/notion";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name || body?.amount === undefined) {
    return NextResponse.json({ error: "name and amount are required" }, { status: 400 });
  }
  try {
    await createExpense(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to log expense" }, { status: 502 });
  }
}
