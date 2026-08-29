import { NextResponse } from "next/server";
import { getDbMap, getNotionToken } from "@/lib/userConfig";
import { REQUIRED_PROJECT_PROPS, checkSchema, propertySchema } from "@/lib/projectSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTION_VERSION = "2022-06-28";

async function notion(path: string, token: string, init: RequestInit = {}) {
  // Same overridable base as the rest of the Notion layer, so the harness
  // can exercise the schema path instead of skipping it.
  const base = process.env["NOTION_API_BASE_URL"] || "https://api.notion.com/v1";
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/** Which of the required Projects properties exist right now. */
export async function GET() {
  const token = await getNotionToken();
  if (!token) return NextResponse.json({ error: "Notion isn't connected." }, { status: 400 });

  const db = await getDbMap();
  if (!db.projects) {
    return NextResponse.json({ error: "No Projects database mapped yet — set it under Settings → Notion." }, { status: 400 });
  }

  const res = await notion(`/databases/${db.projects}`, token);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.body?.message || `Notion returned ${res.status} reading the Projects database.` },
      { status: 502 }
    );
  }

  const checks = checkSchema(res.body?.properties || {});
  return NextResponse.json({
    checks,
    missing: checks.filter((c) => !c.present).length,
    mismatched: checks.filter((c) => c.typeMismatch).length,
    // A relation can't be created without a database to point at.
    canCreateRelations: Boolean(db.clients && db.team),
  });
}

/**
 * Adds the missing properties.
 *
 * Only ever adds. Properties that already exist are skipped entirely — even
 * if their type is wrong — because silently retyping someone's column would
 * destroy whatever is already in it. Type mismatches are reported back for a
 * human to resolve.
 */
export async function POST() {
  const token = await getNotionToken();
  if (!token) return NextResponse.json({ error: "Notion isn't connected." }, { status: 400 });

  const db = await getDbMap();
  if (!db.projects) {
    return NextResponse.json({ error: "No Projects database mapped yet." }, { status: 400 });
  }

  const current = await notion(`/databases/${db.projects}`, token);
  if (!current.ok) {
    return NextResponse.json(
      { error: current.body?.message || `Couldn't read the Projects database (${current.status}).` },
      { status: 502 }
    );
  }

  const existing: Record<string, { type: string }> = current.body?.properties || {};
  const toAdd = REQUIRED_PROJECT_PROPS.filter((p) => !existing[p.name]);

  const needsRelations = toAdd.some((p) => p.kind === "relation");
  if (needsRelations && (!db.clients || !db.team)) {
    return NextResponse.json(
      {
        error:
          "Some of the missing fields are relations to your Clients and Team databases, but those aren't mapped yet. " +
          "Map them under Settings → Notion first, then run this again.",
      },
      { status: 400 }
    );
  }

  if (toAdd.length === 0) {
    return NextResponse.json({ added: [], skipped: REQUIRED_PROJECT_PROPS.map((p) => p.name), message: "Everything was already there." });
  }

  const properties: Record<string, unknown> = {};
  for (const prop of toAdd) {
    properties[prop.name] = propertySchema(prop, { clients: db.clients, team: db.team });
  }

  const patch = await notion(`/databases/${db.projects}`, token, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });

  if (!patch.ok) {
    return NextResponse.json(
      { error: patch.body?.message || `Notion refused the schema change (${patch.status}).` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    added: toAdd.map((p) => p.name),
    skipped: REQUIRED_PROJECT_PROPS.filter((p) => existing[p.name]).map((p) => p.name),
    message: `Added ${toAdd.length} field${toAdd.length === 1 ? "" : "s"} to your Notion Projects database.`,
  });
}
