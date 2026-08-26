import { NextResponse } from "next/server";
import { createAccount } from "@/lib/notion";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name || body?.balance === undefined) {
    return NextResponse.json({ error: "name and balance are required" }, { status: 400 });
  }
  try {
    await createAccount(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to add account" }, { status: 502 });
  }
}
