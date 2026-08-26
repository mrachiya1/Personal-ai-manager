import { NextResponse } from "next/server";
import {
  DB_KEYS,
  getDbMap,
  getNotionToken,
  getUserConfig,
  normaliseDbId,
  saveUserConfig,
  type DbKey,
} from "@/lib/userConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current mapping plus, for each one, whether Notion can actually see it. */
export async function GET() {
  const [map, cfg] = await Promise.all([getDbMap(), getUserConfig()]);
  return NextResponse.json({
    databases: DB_KEYS.map((k) => ({
      key: k,
      id: map[k],
      overridden: Boolean(cfg.notionDb?.[k]),
    })),
  });
}

export async function POST(req: Request) {
  let incoming: Record<string, string>;
  try {
    const body = await req.json();
    incoming = body?.databases || {};
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const cfg = await getUserConfig();
  const next: Partial<Record<DbKey, string>> = { ...(cfg.notionDb || {}) };

  for (const key of DB_KEYS) {
    const raw = incoming[key];
    if (raw === undefined) continue;
    const trimmed = String(raw).trim();
    if (!trimmed) {
      delete next[key];
      continue;
    }
    const id = normaliseDbId(trimmed);
    if (id.length !== 32) {
      return NextResponse.json(
        { error: `“${key}” doesn't look like a Notion database ID or URL — expected 32 hex characters.` },
        { status: 400 }
      );
    }
    next[key] = id;
  }

  await saveUserConfig({ notionDb: next });
  return NextResponse.json({ ok: true });
}

/**
 * Probes each configured database with the user's token so the Settings page
 * can show which ones are genuinely reachable. A valid token that hasn't been
 * *shared* with a database still 404s — the single most common setup mistake,
 * and one worth surfacing explicitly rather than as a blank page later.
 */
export async function PUT() {
  const token = await getNotionToken();
  if (!token) return NextResponse.json({ error: "No Notion connection" }, { status: 400 });

  const map = await getDbMap();

  const checks = await Promise.all(
    DB_KEYS.map(async (key) => {
      try {
        const res = await fetch(`https://api.notion.com/v1/databases/${map[key]}`, {
          headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
          cache: "no-store",
        });
        if (res.ok) {
          const db = await res.json();
          const title = Array.isArray(db?.title) ? db.title.map((t: any) => t.plain_text).join("") : "";
          return { key, ok: true, title: title || null };
        }
        return {
          key,
          ok: false,
          reason:
            res.status === 404
              ? "Not found, or not shared with your integration"
              : `Notion returned ${res.status}`,
        };
      } catch {
        return { key, ok: false, reason: "Network error" };
      }
    })
  );

  return NextResponse.json({ checks });
}
