import { NextResponse } from "next/server";
import { createWishlistItem } from "@/lib/notion";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.item) {
    return NextResponse.json({ error: "item is required" }, { status: 400 });
  }
  try {
    await createWishlistItem(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to add item" }, { status: 502 });
  }
}
