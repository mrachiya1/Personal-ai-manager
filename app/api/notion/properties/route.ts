import { NextResponse } from "next/server";
import { notionFetch } from "@/lib/notion";
import { getDbMap } from "@/lib/userConfig";
import { CUSTOM_TYPES, RESERVED_PROPERTY_NAMES, newPropertySchema, type CustomType } from "@/lib/customProps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(CUSTOM_TYPES.map((t) => t.type));

/**
 * Creates one property on the Projects database.
 *
 * Additive only, like every other schema write in this app: it refuses a name
 * that already exists rather than retyping it, because Notion would drop
 * whatever is in the column. It also refuses the names this screen owns — a
 * user-made "Status" column would collide with the real one and one of them
 * would silently win.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  const type = String(body?.type || "") as CustomType;

  if (!name) return NextResponse.json({ error: "Give the property a name." }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "That name is too long for a Notion property." }, { status: 400 });
  if (!ALLOWED.has(type)) return NextResponse.json({ error: "That property type isn't supported here." }, { status: 400 });
  if (RESERVED_PROPERTY_NAMES.has(name)) {
    return NextResponse.json(
      { error: `“${name}” is one of the columns Orex OS manages. Pick another name.` },
      { status: 409 }
    );
  }

  try {
    const map = await getDbMap();
    if (!map.projects) return NextResponse.json({ error: "No Projects database mapped yet." }, { status: 400 });

    const db = (await notionFetch(`/databases/${map.projects}`)) as { properties?: Record<string, unknown> };
    if (db.properties?.[name]) {
      return NextResponse.json({ error: `“${name}” already exists on the database.` }, { status: 409 });
    }

    await notionFetch(`/databases/${map.projects}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { [name]: newPropertySchema(type) } }),
    });

    // Status is created as a select — Notion's API cannot make a real status
    // property, which has required groups it does not expose. Say so rather
    // than letting the type quietly differ from what was asked for.
    return NextResponse.json({
      ok: true,
      name,
      type: type === "status" ? "select" : type,
      note: type === "status" ? "Created as a Select — Notion's API can't create Status properties. Convert it in Notion if you need the groups." : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Notion refused the new property" },
      { status: 502 }
    );
  }
}
