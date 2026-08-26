import { NextResponse } from "next/server";
import { updateCompany } from "@/lib/notion";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  try {
    await updateCompany(id, body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to update company" }, { status: 502 });
  }
}
