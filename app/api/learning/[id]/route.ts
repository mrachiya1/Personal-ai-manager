import { NextResponse } from "next/server";
import { updateLearningTopic } from "@/lib/notion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    await updateLearningTopic(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // A workspace whose Learning database has no "Completion" column will
    // reject that property by name. Say which one, rather than "502".
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update topic" },
      { status: 502 }
    );
  }
}
