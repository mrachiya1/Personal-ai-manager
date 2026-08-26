import { NextResponse } from "next/server";
import { saveUserConfig, setOpenRouterKey } from "@/lib/userConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-user preferences — AI keys, model choices, location and birth date.
 *
 * These live in the KV store rather than data/app-settings.json specifically
 * so they survive on Vercel, where the filesystem is read-only, and so two
 * people signed into the same deployment don't overwrite each other's keys.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : undefined);

  // The key is handled separately: it is the only encrypted field here.
  const apiKey = str("openRouterApiKey");
  if (apiKey !== undefined) {
    await setOpenRouterKey(apiKey);
  }

  const patch: Record<string, string | undefined> = {};
  for (const field of ["openRouterModel", "openRouterVisionModel", "homeLat", "homeLon", "homeTzOffset", "birthDate"]) {
    const v = str(field);
    if (v !== undefined) patch[field] = v;
  }

  if (patch.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.birthDate)) {
    return NextResponse.json({ error: "Birth date must be YYYY-MM-DD." }, { status: 400 });
  }
  for (const numeric of ["homeLat", "homeLon", "homeTzOffset"]) {
    if (patch[numeric] && !Number.isFinite(Number(patch[numeric]))) {
      return NextResponse.json({ error: `${numeric} must be a number.` }, { status: 400 });
    }
  }

  if (Object.keys(patch).length > 0) {
    await saveUserConfig(patch);
  }

  return NextResponse.json({ ok: true });
}
