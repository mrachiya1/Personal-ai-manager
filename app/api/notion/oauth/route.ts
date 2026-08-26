import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { setNotionToken } from "@/lib/userConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-click "Connect Notion", for when this app is registered as a PUBLIC
// Notion integration rather than each person making their own internal one.
//
// It is wired up and ready, but dormant until three env vars exist:
//
//   NOTION_OAUTH_CLIENT_ID
//   NOTION_OAUTH_CLIENT_SECRET
//   NOTION_OAUTH_REDIRECT_URI   (e.g. https://your-app.vercel.app/api/notion/oauth?step=callback)
//
// Create the integration at notion.so/my-integrations -> "Public integration",
// and paste that exact redirect URI into its OAuth Domain & URIs section.
// Until then the Settings page shows the paste-a-token path instead, which
// needs no registration at all.

const AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const STATE_COOKIE = "notion_oauth_state";

export function oauthConfigured() {
  return Boolean(
    process.env.NOTION_OAUTH_CLIENT_ID &&
      process.env.NOTION_OAUTH_CLIENT_SECRET &&
      process.env.NOTION_OAUTH_REDIRECT_URI
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const step = url.searchParams.get("step");

  if (!oauthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Notion OAuth isn't configured on this install. Set NOTION_OAUTH_CLIENT_ID, " +
          "NOTION_OAUTH_CLIENT_SECRET and NOTION_OAUTH_REDIRECT_URI, or connect with an " +
          "integration token on the Settings page instead.",
      },
      { status: 501 }
    );
  }

  const clientId = process.env.NOTION_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET!;
  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI!;

  /* ---------- Step 1: send the user to Notion ---------- */
  if (step !== "callback") {
    const state = crypto.randomBytes(16).toString("hex");
    const jar = await cookies();
    jar.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });

    const authorize = new URL(AUTHORIZE_URL);
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("owner", "user");
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", state);
    return NextResponse.redirect(authorize.toString());
  }

  /* ---------- Step 2: Notion sends the user back ---------- */
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  if (denied) return NextResponse.redirect(new URL("/settings?notion=denied", url.origin));
  if (!code) return NextResponse.redirect(new URL("/settings?notion=missing_code", url.origin));

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!expected || expected !== state) {
    // CSRF guard: a callback we didn't start must never write a token.
    return NextResponse.redirect(new URL("/settings?notion=bad_state", url.origin));
  }

  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });

    const data = await res.json();
    if (!res.ok || !data?.access_token) {
      return NextResponse.redirect(new URL("/settings?notion=exchange_failed", url.origin));
    }

    await setNotionToken(data.access_token, {
      authType: "oauth",
      workspaceName: data.workspace_name,
      workspaceIcon: data.workspace_icon,
      botId: data.bot_id,
    });

    return NextResponse.redirect(new URL("/settings?notion=connected", url.origin));
  } catch {
    return NextResponse.redirect(new URL("/settings?notion=exchange_failed", url.origin));
  }
}
