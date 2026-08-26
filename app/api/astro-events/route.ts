import { NextResponse } from "next/server";
import { createAstroEvent } from "@/lib/notion";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name || !body?.eventDate) {
    return NextResponse.json({ error: "name and eventDate are required" }, { status: 400 });
  }
  try {
    await createAstroEvent(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to log astro event" }, { status: 502 });
  }
}
