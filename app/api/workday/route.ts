import { NextResponse } from "next/server";
import {
  clearWorkWindow,
  getWorkPattern,
  getWorkWindow,
  setWorkWindow,
  suggestWindowFromWake,
  WorkWindowError,
} from "@/lib/workday";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wake = url.searchParams.get("fromWake");
  const [window, pattern] = await Promise.all([getWorkWindow(), getWorkPattern()]);
  // ?fromWake=<iso> asks "what would you suggest if I got up then" without
  // committing to it — the /sleep page offers the answer before saving it.
  const suggestion = wake ? await suggestWindowFromWake(wake) : null;
  return NextResponse.json({ window, pattern, suggestion });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const window = await setWorkWindow({
      start: String(body?.start ?? ""),
      end: String(body?.end ?? ""),
      alsoPattern: Boolean(body?.alsoPattern),
      fromWake: body?.fromWake ? String(body.fromWake) : undefined,
    });
    return NextResponse.json({ ok: true, window });
  } catch (err) {
    if (err instanceof WorkWindowError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save those hours" }, { status: 500 });
  }
}

export async function DELETE() {
  const window = await clearWorkWindow();
  return NextResponse.json({ ok: true, window });
}
