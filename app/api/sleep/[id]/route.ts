import { NextResponse } from "next/server";
import { deleteSleepLog } from "@/lib/notion";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteSleepLog(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Couldn't delete that entry" }, { status: 502 });
  }
}
