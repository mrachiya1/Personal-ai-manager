import { NextResponse } from "next/server";
import { clearNotionToken, setNotionToken } from "@/lib/userConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Connects a Notion workspace by internal-integration token.
 *
 * The token is VERIFIED against Notion before it is stored. Saving an unchecked
 * secret would mean the person leaves Settings believing they are connected and
 * discovers otherwise as a 401 on some unrelated page later.
 */
export async function POST(req: Request) {
  let token = "";
  try {
    const body = await req.json();
    token = String(body?.token || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: "Paste your Notion integration secret first." }, { status: 400 });
  }
  if (!/^(ntn_|secret_)/.test(token)) {
    return NextResponse.json(
      { error: "That doesn't look like a Notion integration secret — they start with “ntn_” or “secret_”." },
      { status: 400 }
    );
  }

  try {
    // Same overridable base as lib/notion.ts. Hardcoding the URL here meant
    // this route — the one that decides whether a token is real — was the
    // only part of the Notion layer the harness could not exercise.
    const base = process.env["NOTION_API_BASE_URL"] || "https://api.notion.com/v1";
    const res = await fetch(`${base}/users/me`, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
      cache: "no-store",
    });

    if (res.status === 401) {
      return NextResponse.json({ error: "Notion rejected that secret. Check you copied the whole thing." }, { status: 400 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: `Notion returned ${res.status} while verifying the token.` }, { status: 502 });
    }

    const me = await res.json();
    const workspaceName: string | undefined = me?.bot?.workspace_name || me?.name;

    await setNotionToken(token, {
      authType: "token",
      workspaceName,
      botId: me?.id,
    });

    return NextResponse.json({
      ok: true,
      workspaceName: workspaceName || "your workspace",
      botName: me?.name || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't reach Notion" },
      { status: 502 }
    );
  }
}

export async function DELETE() {
  await clearNotionToken();
  return NextResponse.json({ ok: true });
}
