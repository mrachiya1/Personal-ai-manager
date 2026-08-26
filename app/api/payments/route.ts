import { NextResponse } from "next/server";
import { createPayment } from "@/lib/notion";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.label || body?.amount === undefined) {
    return NextResponse.json({ error: "label and amount are required" }, { status: 400 });
  }
  try {
    await createPayment(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to add payment" }, { status: 502 });
  }
}
