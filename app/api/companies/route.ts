import { NextResponse } from "next/server";
import { createCompany } from "@/lib/notion";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  try {
    await createCompany(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to create company" }, { status: 502 });
  }
}
