import { NextResponse } from "next/server";
import { updateAccount } from "@/lib/notion";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  try {
    await updateAccount(id, body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to update account" }, { status: 502 });
  }
}
