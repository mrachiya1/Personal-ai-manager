import { NextResponse } from "next/server";
import { createLearningTopic } from "@/lib/notion";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.topic) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }
  try {
    await createLearningTopic(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to add topic" }, { status: 502 });
  }
}
