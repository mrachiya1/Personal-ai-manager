import { NextResponse } from "next/server";
import { createIdea } from "@/lib/notion";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.idea) {
    return NextResponse.json({ error: "idea is required" }, { status: 400 });
  }
  try {
    await createIdea(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to create idea" }, { status: 502 });
  }
}
